import CloudKit
import Foundation

actor ICloudStore {
  private let container: CKContainer?
  private let io: CloudKitIO?
  private var enabled = false
  private var accountToken: String?
  private var epoch = 0
  private var lease = 0

  init(containerIdentifier: String?) {
    if let containerIdentifier, !containerIdentifier.isEmpty {
      let container = CKContainer(identifier: containerIdentifier)
      self.container = container
      self.io = CloudKitIO(database: container.privateCloudDatabase)
    } else {
      self.container = nil
      self.io = nil
    }
  }

  func stop() async {
    enabled = false
    accountToken = nil
    epoch += 1
    if let io { lease = await io.invalidate() }
  }

  func status() async throws -> String {
    guard let container else {
      return try iCloudJSON(["status": "not_configured", "accountToken": NSNull(), "enabled": false])
    }
    let status = try await container.accountStatus()
    let statusName: String
    var token: String?
    switch status {
    case .available:
      statusName = "available"
      token = iCloudHash(try await container.userRecordID().recordName)
    case .noAccount: statusName = "not_authenticated"
    case .restricted: statusName = "restricted"
    case .couldNotDetermine, .temporarilyUnavailable: statusName = "unavailable"
    @unknown default: statusName = "unavailable"
    }
    if enabled && token != accountToken { await stop() }
    return try iCloudJSON(["status": statusName, "accountToken": token as Any? ?? NSNull(), "enabled": enabled])
  }

  func configure(_ value: Bool, expectedAccountToken: String?) async throws -> String {
    let requestedEpoch = epoch + 1
    await stop()
    guard value else { return try iCloudJSON(["enabled": false]) }
    guard let container, let io else { throw ICloudFailure.notConfigured }
    guard epoch == requestedEpoch else { throw ICloudFailure.disabled }
    let currentEpoch = requestedEpoch
    let status = try await container.accountStatus()
    guard status == .available else {
      throw status == .restricted ? ICloudFailure.restricted : ICloudFailure.notAuthenticated
    }
    let token = iCloudHash(try await container.userRecordID().recordName)
    guard epoch == currentEpoch, token == expectedAccountToken else { throw ICloudFailure.accountChanged }
    lease = await io.invalidate()
    guard epoch == currentEpoch else { throw ICloudFailure.accountChanged }
    accountToken = token
    enabled = true
    return try iCloudJSON(["enabled": true])
  }

  private func context(_ collection: String) async throws -> (CloudKitIO, CKRecordZone.ID, Int, Int) {
    let valid = collection == "guest" || (collection.hasPrefix("account:") && UUID(uuidString: String(collection.dropFirst(8))) != nil)
    guard valid else { throw ICloudFailure.invalidData }
    guard enabled, let io, let container else { throw ICloudFailure.disabled }
    let capturedEpoch = epoch
    guard try await container.accountStatus() == .available else { throw ICloudFailure.notAuthenticated }
    let token = iCloudHash(try await container.userRecordID().recordName)
    try check(capturedEpoch)
    guard token == accountToken else {
      await stop()
      throw ICloudFailure.accountChanged
    }
    let zone = CKRecordZone.ID(zoneName: "JustGoCollection_" + iCloudHash(collection), ownerName: CKCurrentUserDefaultName)
    return (io, zone, epoch, lease)
  }

  private func check(_ capturedEpoch: Int) throws {
    guard enabled, capturedEpoch == epoch else { throw ICloudFailure.disabled }
  }

  private func generation(_ root: CKRecord) throws -> String {
    guard root.recordType == "JustGoCollection", let value = root["generation"] as? String,
          UUID(uuidString: value) != nil else { throw ICloudFailure.invalidData }
    return value
  }

  private func root(_ zone: CKRecordZone.ID, io: CloudKitIO, lease: Int) async throws -> CKRecord {
    let id = CKRecord.ID(recordName: "collection", zoneID: zone)
    if let root = try await io.fetch([id], lease: lease)[id] { return root }
    let root = CKRecord(recordType: "JustGoCollection", recordID: id)
    root["generation"] = UUID().uuidString as NSString
    root["wasReset"] = NSNumber(value: false)
    root["closed"] = NSNumber(value: false)
    root["revision"] = UUID().uuidString as NSString
    do { try await io.modify(saving: [root], lease: lease) }
    catch {
      // Another device may have created the same root. Read its generation;
      // never replace it with this device's provisional generation.
      if ICloudFailure.sanitized(error) != .conflict { throw error }
    }
    guard let saved = try await io.fetch([id], lease: lease)[id] else { throw ICloudFailure.unavailable }
    return saved
  }

  func read(_ collection: String, cursor: String?) async throws -> String {
    let (io, zone, capturedEpoch, lease) = try await context(collection)
    try await io.ensureZone(zone, lease: lease)
    let before = try await root(zone, io: io, lease: lease)
    let generation = try generation(before)
    guard let revision = before.recordChangeTag else { throw ICloudFailure.unavailable }
    let token = try ICloudCursor.decode(cursor, collection: collection, generation: generation)
    let page = try await io.changes(zone, token: token, lease: lease)
    let after = try await root(zone, io: io, lease: lease)
    guard try self.generation(after) == generation else { throw ICloudFailure.staleGeneration }
    guard after.recordChangeTag == revision else { throw ICloudFailure.conflict }
    try check(capturedEpoch)
    let values: [[String: String]] = try page.records.compactMap { record in
      if record.recordID.recordName == "collection" { return nil }
      guard record.recordType == "JustGoValue" else { throw ICloudFailure.invalidData }
      guard record["generation"] as? String == generation else { return nil }
      guard let id = record["itemId"] as? String,
            let value = record.encryptedValues["value"] as? String else { throw ICloudFailure.invalidData }
      let item = ICloudValue(id: id, value: value)
      try item.validate()
      return ["id": id, "value": value]
    }
    return try iCloudJSON(["generation": generation, "revision": revision, "records": values,
                           "wasReset": (after["wasReset"] as? NSNumber)?.boolValue ?? false,
                           "closed": (after["closed"] as? NSNumber)?.boolValue ?? false,
                           "cursor": ICloudCursor.encode(page.token, collection: collection, generation: generation),
                           "hasMore": page.hasMore])
  }

  func write(_ collection: String, expectedGeneration: String, encodedRecords: String) async throws -> String {
    guard UUID(uuidString: expectedGeneration) != nil,
          encodedRecords.utf8.count <= 20_000_000,
          let data = encodedRecords.data(using: .utf8),
          let values = try? JSONDecoder().decode([ICloudValue].self, from: data),
          !values.isEmpty, values.count <= 50,
          Set(values.map { $0.id.lowercased() }).count == values.count else { throw ICloudFailure.invalidData }
    try values.forEach { try $0.validate() }
    let (io, zone, capturedEpoch, lease) = try await context(collection)
    let root = try await root(zone, io: io, lease: lease)
    guard (root["closed"] as? NSNumber)?.boolValue != true else { throw ICloudFailure.collectionDeleted }
    guard try generation(root) == expectedGeneration else { throw ICloudFailure.staleGeneration }
    let ids = values.map { CKRecord.ID(recordName: expectedGeneration + ":" + $0.id.lowercased(), zoneID: zone) }
    let existing = try await io.fetch(ids, lease: lease)
    var records = [CKRecord]()
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
    // Every upload compares the root change tag in the same atomic custom-zone
    // transaction. A reset racing this write makes the complete batch fail.
    root["revision"] = UUID().uuidString as NSString
    try await io.modify(saving: [root] + records, lease: lease)
    try check(capturedEpoch)
    return try iCloudJSON(["generation": expectedGeneration])
  }

  func reset(_ collection: String, expectedGeneration: String, expectedRevision: String? = nil) async throws -> String {
    let (io, zone, capturedEpoch, lease) = try await context(collection)
    let root = try await root(zone, io: io, lease: lease)
    guard (root["closed"] as? NSNumber)?.boolValue != true else { throw ICloudFailure.collectionDeleted }
    guard try generation(root) == expectedGeneration else { throw ICloudFailure.staleGeneration }
    if let expectedRevision {
      guard !expectedRevision.isEmpty, expectedRevision.utf8.count <= 1024 else { throw ICloudFailure.invalidData }
      guard root.recordChangeTag == expectedRevision else { throw ICloudFailure.conflict }
    }
    let next = UUID().uuidString
    root["generation"] = next as NSString
    root["wasReset"] = NSNumber(value: true)
    root["revision"] = UUID().uuidString as NSString
    try await io.modify(saving: [root], lease: lease)
    try check(capturedEpoch)
    return try iCloudJSON(["generation": next])
  }

  func close(_ collection: String, expectedGeneration: String) async throws -> String {
    guard collection.hasPrefix("account:") else { throw ICloudFailure.invalidData }
    let (io, zone, capturedEpoch, lease) = try await context(collection)
    let root = try await root(zone, io: io, lease: lease)
    let current = try generation(root)
    if (root["closed"] as? NSNumber)?.boolValue == true {
      try check(capturedEpoch)
      return try iCloudJSON(["generation": current])
    }
    guard current == expectedGeneration else { throw ICloudFailure.staleGeneration }
    let next = UUID().uuidString
    root["generation"] = next as NSString
    root["wasReset"] = NSNumber(value: true)
    root["closed"] = NSNumber(value: true)
    root["revision"] = UUID().uuidString as NSString
    try await io.modify(saving: [root], lease: lease)
    try check(capturedEpoch)
    return try iCloudJSON(["generation": next])
  }

  // Reset is a durable fence; physical cleanup is resumable and bounded. The
  // caller stores the new generation before beginning these pages and must not
  // describe deletion as complete until cleanup has reached hasMore=false.
  func purge(_ collection: String, expectedGeneration: String, cursor: String?) async throws -> String {
    let (io, zone, capturedEpoch, lease) = try await context(collection)
    let root = try await root(zone, io: io, lease: lease)
    guard try generation(root) == expectedGeneration else { throw ICloudFailure.staleGeneration }
    let token = try ICloudCursor.decode(cursor, collection: collection, generation: expectedGeneration)
    let page = try await io.changes(zone, token: token, lease: lease)
    let ids = page.records.filter {
      $0.recordType == "JustGoValue" && $0["generation"] as? String != expectedGeneration
    }.map { $0.recordID }
    if !ids.isEmpty {
      root["revision"] = UUID().uuidString as NSString
      try await io.modify(saving: [root], deleting: ids, lease: lease)
    }
    let current = try await self.root(zone, io: io, lease: lease)
    guard try generation(current) == expectedGeneration else { throw ICloudFailure.staleGeneration }
    try check(capturedEpoch)
    return try iCloudJSON(["generation": expectedGeneration,
                           "cursor": ICloudCursor.encode(page.token, collection: collection, generation: expectedGeneration),
                           "hasMore": page.hasMore])
  }
}
