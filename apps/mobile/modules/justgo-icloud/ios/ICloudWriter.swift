import CloudKit
import Foundation

// The store supplies account/lifecycle checks and I/O. Each attempt obtains a
// fresh root and saves it with its values in one conditional atomic operation.
struct ICloudWriter {
  static let payloadByteLimit = 1_000_000

  let expectedGeneration: String
  let loadRoot: () async throws -> CKRecord
  let fetch: ([CKRecord.ID]) async throws -> [CKRecord.ID: CKRecord]
  let save: ([CKRecord]) async throws -> Void
  let check: () async throws -> Void

  func write(_ values: [ICloudValue]) async throws {
    var batches = [[ICloudValue]]()
    var batch = [ICloudValue]()
    var bytes = 0
    for value in values {
      let size = value.value.utf8.count
      guard size <= Self.payloadByteLimit else { throw ICloudFailure.invalidData }
      if !batch.isEmpty && (batch.count == 50 || bytes + size > Self.payloadByteLimit) {
        batches.append(batch)
        batch = []
        bytes = 0
      }
      batch.append(value)
      bytes += size
    }
    if !batch.isEmpty { batches.append(batch) }
    for batch in batches { try await commit(batch) }
  }

  private func commit(_ values: [ICloudValue]) async throws {
    try await check()
    let root = try await loadRoot()
    guard (root["closed"] as? NSNumber)?.boolValue != true else { throw ICloudFailure.collectionDeleted }
    guard try iCloudGeneration(root) == expectedGeneration else { throw ICloudFailure.staleGeneration }
    let ids = values.map {
      CKRecord.ID(recordName: expectedGeneration + ":" + $0.id.lowercased(), zoneID: root.recordID.zoneID)
    }
    let existing = try await fetch(ids)
    var records = [root]
    for (value, id) in zip(values, ids) {
      if let old = existing[id] {
        guard old.recordType == "JustGoValue", old["generation"] as? String == expectedGeneration,
              old["itemId"] as? String == value.id.lowercased(),
              old.encryptedValues["value"] as? String == value.value else { throw ICloudFailure.conflict }
      } else {
        let record = CKRecord(recordType: "JustGoValue", recordID: id)
        record["generation"] = expectedGeneration as NSString
        record["itemId"] = value.id.lowercased() as NSString
        record.encryptedValues["value"] = value.value as NSString
        records.append(record)
      }
    }
    root["revision"] = UUID().uuidString as NSString
    do {
      try await save(records)
    } catch {
      guard ICloudFailure.isLimitExceeded(error) else { throw error }
      // CloudKit can lower its request limits. Halving terminates after at most
      // 2*n-1 attempts; a rejected singleton is a permanent payload failure.
      guard values.count > 1 else { throw ICloudFailure.invalidData }
      let middle = values.count / 2
      try await commit(Array(values[..<middle]))
      try await commit(Array(values[middle...]))
    }
    try await check()
  }
}
