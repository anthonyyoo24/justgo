import CloudKit
import Foundation
@testable import JustGoICloud

enum WriterFixtureFailure: Error {
  case missingAtomicRoot
}

actor WriterFixture {
  let initialGeneration = UUID().uuidString
  private let zone = CKRecordZone.ID(zoneName: "Synthetic", ownerName: CKCurrentUserDefaultName)
  private var generation: String
  private var lastRoot: CKRecord?
  private var records = [CKRecord.ID: CKRecord]()
  private var rootLoads = 0
  private var fetches = 0
  private var attempts = [[CKRecord]]()
  private var accepted = [[CKRecord]]()
  private let maximumValues: Int?
  private let wrappedLimit: Bool
  private let rejectEverySave: Bool
  private let resetAfterSave: Bool
  private let resetDuringSave: Bool
  private let disableAfterSave: Bool
  private let changeAccountAfterSave: Bool
  private let closed: Bool
  private var disabled: Bool
  private var changedAccount = false

  init(
    maximumValues: Int? = nil,
    wrappedLimit: Bool = false,
    rejectEverySave: Bool = false,
    resetAfterSave: Bool = false,
    resetDuringSave: Bool = false,
    disableAfterSave: Bool = false,
    changeAccountAfterSave: Bool = false,
    closed: Bool = false,
    disabled: Bool = false
  ) {
    generation = initialGeneration
    self.maximumValues = maximumValues
    self.wrappedLimit = wrappedLimit
    self.rejectEverySave = rejectEverySave
    self.resetAfterSave = resetAfterSave
    self.resetDuringSave = resetDuringSave
    self.disableAfterSave = disableAfterSave
    self.changeAccountAfterSave = changeAccountAfterSave
    self.closed = closed
    self.disabled = disabled
  }

  func writer() -> ICloudWriter {
    ICloudWriter(
      expectedGeneration: initialGeneration,
      loadRoot: { try self.loadRoot() },
      fetch: { ids in self.fetch(ids) },
      save: { records in try self.save(records) },
      check: { try self.check() }
    )
  }

  private func check() throws {
    if disabled { throw ICloudFailure.disabled }
  }

  private func loadRoot() throws -> CKRecord {
    rootLoads += 1
    if changedAccount { throw ICloudFailure.accountChanged }
    let root = CKRecord(recordType: "JustGoCollection", recordID: CKRecord.ID(recordName: "collection", zoneID: zone))
    root["generation"] = generation as NSString
    root["closed"] = NSNumber(value: closed)
    root["revision"] = UUID().uuidString as NSString
    lastRoot = root
    return root
  }

  private func fetch(_ ids: [CKRecord.ID]) -> [CKRecord.ID: CKRecord] {
    fetches += 1
    return records.filter { ids.contains($0.key) }
  }

  private func save(_ batch: [CKRecord]) throws {
    guard let root = batch.first, root === lastRoot,
          root.recordType == "JustGoCollection", root.recordID.recordName == "collection",
          root["revision"] as? String != nil else { throw WriterFixtureFailure.missingAtomicRoot }
    attempts.append(batch)
    if rejectEverySave || maximumValues.map({ batch.count - 1 > $0 }) == true {
      let error = CKError(.limitExceeded)
      if wrappedLimit {
        throw CKError(.partialFailure, userInfo: [CKPartialErrorsByItemIDKey: [root.recordID: error]])
      }
      throw error
    }
    if resetDuringSave { generation = UUID().uuidString }
    guard root["generation"] as? String == generation else { throw CKError(.serverRecordChanged) }
    for record in batch.dropFirst() { records[record.recordID] = record }
    accepted.append(batch)
    if resetAfterSave { generation = UUID().uuidString }
    if disableAfterSave { disabled = true }
    if changeAccountAfterSave { changedAccount = true }
  }

  func snapshot() -> (rootLoads: Int, fetches: Int, attempts: [[CKRecord]], accepted: [[CKRecord]]) {
    (rootLoads, fetches, attempts, accepted)
  }
}
