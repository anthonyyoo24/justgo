import CloudKit
import XCTest
@testable import JustGoICloud

final class ICloudWriterTests: XCTestCase {
  private func values(_ count: Int, value: String = "{}") -> [ICloudValue] {
    (0..<count).map { _ in ICloudValue(id: UUID().uuidString, value: value) }
  }

  private func expectFailure(
    _ expected: ICloudFailure,
    writer: ICloudWriter,
    values: [ICloudValue],
    file: StaticString = #filePath,
    line: UInt = #line
  ) async {
    do {
      try await writer.write(values)
      XCTFail("Expected a rejected write", file: file, line: line)
    } catch {
      XCTAssertEqual(ICloudFailure.sanitized(error), expected, file: file, line: line)
    }
  }

  func testLargeMultibytePayloadsUseBoundedAtomicBatches() async throws {
    let fixture = WriterFixture()
    let input = values(50, value: "\"" + String(repeating: "🧭", count: 16_000) + "\"")
    try input.forEach { try $0.validate() }
    XCTAssertGreaterThan(input.reduce(0) { $0 + $1.value.utf8.count }, 3_000_000)
    try await fixture.writer().write(input)
    let result = await fixture.snapshot()
    XCTAssertEqual(result.rootLoads, 4)
    XCTAssertEqual(result.accepted.map { $0.count - 1 }, [15, 15, 15, 5])
    XCTAssertEqual(result.accepted.flatMap { $0.dropFirst().map { $0["itemId"] as? String } }, input.map { $0.id.lowercased() })
    for batch in result.accepted {
      XCTAssertEqual(batch.first?.recordID.recordName, "collection")
      XCTAssertLessThanOrEqual(batch.count, 51)
      let bytes = batch.dropFirst().reduce(0) { $0 + (($1.encryptedValues["value"] as? String)?.utf8.count ?? 0) }
      XCTAssertLessThanOrEqual(bytes, ICloudWriter.payloadByteLimit)
      for record in batch.dropFirst() {
        XCTAssertEqual(record["generation"] as? String, batch.first?["generation"] as? String)
        XCTAssertNil(record["value"])
        XCTAssertEqual(record.encryptedValues["value"] as? String, input.first?.value)
      }
    }
  }

  func testSmallPayloadsRetainFiftyValueBatchAndIdempotentRetry() async throws {
    let fixture = WriterFixture()
    let input = values(50)
    let writer = await fixture.writer()
    try await writer.write(input)
    try await writer.write(input)
    let result = await fixture.snapshot()
    XCTAssertEqual(result.accepted.map(\.count), [51, 1])
    XCTAssertEqual(result.rootLoads, 2)
  }

  func testImmutablePayloadConflictStopsBeforeSaving() async throws {
    let fixture = WriterFixture()
    let input = values(1)
    let writer = await fixture.writer()
    try await writer.write(input)
    await expectFailure(.conflict, writer: writer, values: [ICloudValue(id: input[0].id, value: "{\"changed\":true}")])
    let result = await fixture.snapshot()
    XCTAssertEqual(result.accepted.count, 1)
  }

  func testLimitExceededHalvesAndRefetchesRootForEveryAttempt() async throws {
    let fixture = WriterFixture(maximumValues: 2, wrappedLimit: true)
    let input = values(8)
    try await fixture.writer().write(input)
    let result = await fixture.snapshot()
    XCTAssertEqual(result.attempts.map { $0.count - 1 }, [8, 4, 2, 2, 4, 2, 2])
    XCTAssertEqual(result.rootLoads, result.attempts.count)
    XCTAssertEqual(result.accepted.flatMap { $0.dropFirst().map { $0["itemId"] as? String } }, input.map { $0.id.lowercased() })
  }

  func testRejectedSingletonTerminatesWithPermanentPayloadFailure() async {
    let fixture = WriterFixture(rejectEverySave: true)
    await expectFailure(.invalidData, writer: await fixture.writer(), values: values(8))
    let result = await fixture.snapshot()
    XCTAssertEqual(result.attempts.map { $0.count - 1 }, [8, 4, 2, 1])
    XCTAssertTrue(result.accepted.isEmpty)
  }

  func testOversizedSinglePayloadFailsBeforeAnyCloudOperation() async {
    let fixture = WriterFixture()
    await expectFailure(
      .invalidData,
      writer: await fixture.writer(),
      values: values(1, value: String(repeating: "x", count: ICloudWriter.payloadByteLimit + 1))
    )
    let result = await fixture.snapshot()
    XCTAssertEqual(result.rootLoads, 0)
    XCTAssertTrue(result.attempts.isEmpty)
  }

  func testResetBetweenSplitBatchesRejectsRemainingOldGeneration() async {
    let fixture = WriterFixture(maximumValues: 2, resetAfterSave: true)
    await expectFailure(.staleGeneration, writer: await fixture.writer(), values: values(8))
    let result = await fixture.snapshot()
    XCTAssertEqual(result.attempts.map { $0.count - 1 }, [8, 4, 2])
    XCTAssertEqual(result.rootLoads, 4)
    XCTAssertEqual(result.accepted.count, 1)
  }

  func testResetRacingAtomicSaveRejectsCompleteBatchWithoutRetry() async {
    let fixture = WriterFixture(resetDuringSave: true)
    await expectFailure(.conflict, writer: await fixture.writer(), values: values(2))
    let result = await fixture.snapshot()
    XCTAssertEqual(result.attempts.count, 1)
    XCTAssertTrue(result.accepted.isEmpty)
  }

  func testDisableAfterAcceptedSplitStopsFurtherWork() async {
    let fixture = WriterFixture(maximumValues: 2, disableAfterSave: true)
    await expectFailure(.disabled, writer: await fixture.writer(), values: values(8))
    let result = await fixture.snapshot()
    XCTAssertEqual(result.attempts.map { $0.count - 1 }, [8, 4, 2])
    XCTAssertEqual(result.rootLoads, 3)
    XCTAssertEqual(result.accepted.count, 1)
  }

  func testAccountChangeBeforeNextSplitStopsFurtherWork() async {
    let fixture = WriterFixture(maximumValues: 2, changeAccountAfterSave: true)
    await expectFailure(.accountChanged, writer: await fixture.writer(), values: values(8))
    let result = await fixture.snapshot()
    XCTAssertEqual(result.attempts.map { $0.count - 1 }, [8, 4, 2])
    XCTAssertEqual(result.rootLoads, 4)
    XCTAssertEqual(result.accepted.count, 1)
  }

  func testClosedCollectionAndInvalidatedLeaseStopBeforeRecordFetch() async {
    let closed = WriterFixture(closed: true)
    await expectFailure(.collectionDeleted, writer: await closed.writer(), values: values(1))
    let closedResult = await closed.snapshot()
    XCTAssertEqual(closedResult.rootLoads, 1)
    XCTAssertEqual(closedResult.fetches, 0)

    let disabled = WriterFixture(disabled: true)
    await expectFailure(.disabled, writer: await disabled.writer(), values: values(1))
    let disabledResult = await disabled.snapshot()
    XCTAssertEqual(disabledResult.rootLoads, 0)
    XCTAssertTrue(disabledResult.attempts.isEmpty)
  }
}
