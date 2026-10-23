import CloudKit
import XCTest
@testable import JustGoICloud

final class ICloudModifyResultsTests: XCTestCase {
  private let record = CKRecord(recordType: "Synthetic")

  func testRecordQuotaSurvivesSuccessfulOrUninformativeTerminalResults() {
    let terminalResults: [Result<Void, Error>] = [
      .success(()),
      .failure(CKError(.partialFailure)),
      .failure(CKError(.internalError)),
    ]
    for terminal in terminalResults {
      let operation = CKModifyRecordsOperation()
      var completion: Result<Void, Error>?
      installICloudModifyResultBlocks(on: operation) { completion = $0 }
      operation.perRecordSaveBlock?(record.recordID, .failure(CKError(.quotaExceeded)))
      operation.modifyRecordsResultBlock?(terminal)
      assertFailure(completion, equals: .quotaExceeded)
    }
  }

  func testAtomicSiblingFailureCannotHideQuotaInEitherCallbackOrder() {
    for quotaFirst in [true, false] {
      let operation = CKModifyRecordsOperation()
      var completion: Result<Void, Error>?
      installICloudModifyResultBlocks(on: operation) { completion = $0 }
      let errors = quotaFirst
        ? [CKError(.quotaExceeded), CKError(.batchRequestFailed)]
        : [CKError(.batchRequestFailed), CKError(.quotaExceeded)]
      for error in errors {
        operation.perRecordSaveBlock?(record.recordID, .failure(error))
      }
      operation.modifyRecordsResultBlock?(.failure(CKError(.batchRequestFailed)))
      assertFailure(completion, equals: .quotaExceeded)
    }
  }

  func testDeleteFailureAndTerminalQuotaAreBothPreserved() {
    let operation = CKModifyRecordsOperation()
    var completion: Result<Void, Error>?
    installICloudModifyResultBlocks(on: operation) { completion = $0 }
    operation.perRecordDeleteBlock?(record.recordID, .failure(CKError(.batchRequestFailed)))
    operation.modifyRecordsResultBlock?(.failure(CKError(.quotaExceeded)))
    assertFailure(completion, equals: .quotaExceeded)
  }

  func testLimitExceededStillAllowsBoundedWriterSplitting() throws {
    let operation = CKModifyRecordsOperation()
    var completion: Result<Void, Error>?
    installICloudModifyResultBlocks(on: operation) { completion = $0 }
    operation.perRecordSaveBlock?(record.recordID, .failure(CKError(.limitExceeded)))
    operation.modifyRecordsResultBlock?(.failure(CKError(.batchRequestFailed)))
    let result = try XCTUnwrap(completion)
    guard case .failure(let error) = result else { return XCTFail("Expected size failure") }
    XCTAssertEqual(ICloudFailure.sanitized(error), .invalidData)
    XCTAssertTrue(ICloudFailure.isLimitExceeded(error))
  }

  func testQuotaNeverBecomesASizeRetryWhenAnotherRecordExceedsItsLimit() throws {
    let operation = CKModifyRecordsOperation()
    var completion: Result<Void, Error>?
    installICloudModifyResultBlocks(on: operation) { completion = $0 }
    operation.perRecordSaveBlock?(record.recordID, .failure(CKError(.limitExceeded)))
    operation.perRecordSaveBlock?(record.recordID, .failure(CKError(.quotaExceeded)))
    operation.modifyRecordsResultBlock?(.failure(CKError(.partialFailure)))
    let result = try XCTUnwrap(completion)
    guard case .failure(let error) = result else { return XCTFail("Expected quota failure") }
    XCTAssertEqual(ICloudFailure.sanitized(error), .quotaExceeded)
    XCTAssertFalse(ICloudFailure.isLimitExceeded(error))
  }

  func testUnknownRecordFailureRemainsUnavailable() {
    let operation = CKModifyRecordsOperation()
    var completion: Result<Void, Error>?
    installICloudModifyResultBlocks(on: operation) { completion = $0 }
    let error = NSError(domain: "Synthetic", code: 1, userInfo: [NSLocalizedDescriptionKey: "fixture detail"])
    operation.perRecordDeleteBlock?(record.recordID, .failure(error))
    operation.modifyRecordsResultBlock?(.success(()))
    assertFailure(completion, equals: .unavailable)
  }

  func testSuccessfulRecordsAndTerminalResultCompleteOnce() throws {
    let operation = CKModifyRecordsOperation()
    var completions: [Result<Void, Error>] = []
    installICloudModifyResultBlocks(on: operation) { completions.append($0) }
    operation.perRecordSaveBlock?(record.recordID, .success(record))
    operation.perRecordDeleteBlock?(record.recordID, .success(()))
    XCTAssertTrue(completions.isEmpty)
    operation.modifyRecordsResultBlock?(.success(()))
    operation.modifyRecordsResultBlock?(.failure(CKError(.quotaExceeded)))
    XCTAssertEqual(completions.count, 1)
    XCTAssertNoThrow(try completions[0].get())
  }

  func testTerminalOnlyFailureIsUnchangedAndCompletesOnce() throws {
    let operation = CKModifyRecordsOperation()
    var completions: [Result<Void, Error>] = []
    installICloudModifyResultBlocks(on: operation) { completions.append($0) }
    operation.modifyRecordsResultBlock?(.failure(CKError(.quotaExceeded)))
    operation.modifyRecordsResultBlock?(.success(()))
    XCTAssertEqual(completions.count, 1)
    assertFailure(completions.first, equals: .quotaExceeded)
  }

  private func assertFailure(
    _ result: Result<Void, Error>?,
    equals expected: ICloudFailure,
    file: StaticString = #filePath,
    line: UInt = #line
  ) {
    guard case .failure(let error) = result else {
      return XCTFail("Expected a completed failure", file: file, line: line)
    }
    XCTAssertEqual(ICloudFailure.sanitized(error), expected, file: file, line: line)
  }
}
