import CloudKit
import Foundation

// CloudKit invokes each operation's callbacks serially. The collector never
// escapes its operation until the final result callback has completed.
private final class OperationValues<T>: @unchecked Sendable {
  var value: T
  init(_ value: T) { self.value = value }
}

struct ICloudChanges {
  let records: [CKRecord]
  let token: CKServerChangeToken
  let hasMore: Bool
}

func installICloudModifyResultBlocks(
  on operation: CKModifyRecordsOperation,
  completion: @escaping (Result<Void, Error>) -> Void
) {
  let failures = OperationValues<[Error]>([])
  let completed = OperationValues(false)
  operation.perRecordSaveBlock = { _, result in
    if case .failure(let error) = result { failures.value.append(error) }
  }
  operation.perRecordDeleteBlock = { _, result in
    if case .failure(let error) = result { failures.value.append(error) }
  }
  operation.modifyRecordsResultBlock = { result in
    guard !completed.value else { return }
    completed.value = true
    guard !failures.value.isEmpty else { completion(result); return }
    if case .failure(let error) = result { failures.value.append(error) }
    // The terminal callback follows all record callbacks. Preserve every cause,
    // including atomic batch placeholders, so quota wins and size retry retains
    // the underlying CloudKit codes. Only the sanitized result crosses to JS.
    let errors = Dictionary(uniqueKeysWithValues: failures.value.enumerated().map {
      (AnyHashable($0.offset), $0.element)
    })
    completion(.failure(CKError(.partialFailure, userInfo: [CKPartialErrorsByItemIDKey: errors])))
  }
}

actor CloudKitIO {
  private let database: CKDatabase
  private var epoch = 0
  private var operations: [UUID: CKOperation] = [:]

  init(database: CKDatabase) { self.database = database }

  func invalidate() -> Int {
    epoch += 1
    for operation in operations.values { operation.cancel() }
    return epoch
  }

  private func perform<T>(
    _ operation: CKDatabaseOperation,
    lease: Int,
    install: (CheckedContinuation<T, Error>) -> Void
  ) async throws -> T {
    guard lease == epoch else { throw ICloudFailure.disabled }
    let id = UUID()
    operation.configuration.timeoutIntervalForRequest = 30
    operation.configuration.timeoutIntervalForResource = 60
    operation.qualityOfService = .utility
    defer { operations.removeValue(forKey: id) }
    do {
      let result = try await withCheckedThrowingContinuation { continuation in
        install(continuation)
        operations[id] = operation
        database.add(operation)
      }
      guard lease == epoch else { throw ICloudFailure.disabled }
      return result
    } catch {
      guard lease == epoch else { throw ICloudFailure.disabled }
      throw error
    }
  }

  func ensureZone(_ id: CKRecordZone.ID, lease: Int) async throws {
    let operation = CKModifyRecordZonesOperation(recordZonesToSave: [CKRecordZone(zoneID: id)], recordZoneIDsToDelete: nil)
    let _: Void = try await perform(operation, lease: lease) { continuation in
      operation.modifyRecordZonesResultBlock = { result in continuation.resume(with: result) }
    }
  }

  func zoneExists(_ id: CKRecordZone.ID, lease: Int) async throws -> Bool {
    let operation = CKFetchRecordZonesOperation(recordZoneIDs: [id])
    let found = OperationValues<Bool?>(nil)
    let failure = OperationValues<Error?>(nil)
    return try await perform(operation, lease: lease) { continuation in
      operation.perRecordZoneResultBlock = { _, result in
        switch result {
        case .success: found.value = true
        case .failure(let error):
          let cloud = error as? CKError
          if cloud?.code != .zoneNotFound ||
              (cloud?.userInfo[CKErrorUserDidResetEncryptedDataKey] as? NSNumber)?.boolValue == true {
            failure.value = error
          } else { found.value = false }
        }
      }
      operation.fetchRecordZonesResultBlock = { result in
        if let error = failure.value { continuation.resume(throwing: error); return }
        if case .failure(let error) = result,
           (error as? CKError)?.code != .partialFailure,
           (error as? CKError)?.code != .zoneNotFound {
          continuation.resume(throwing: error); return
        }
        guard let exists = found.value else { continuation.resume(throwing: ICloudFailure.unavailable); return }
        continuation.resume(returning: exists)
      }
    }
  }

  func fetch(_ ids: [CKRecord.ID], lease: Int) async throws -> [CKRecord.ID: CKRecord] {
    guard ids.count <= 50 else { throw ICloudFailure.invalidData }
    let operation = CKFetchRecordsOperation(recordIDs: ids)
    let values = OperationValues<[CKRecord.ID: CKRecord]>([:])
    let failure = OperationValues<Error?>(nil)
    return try await perform(operation, lease: lease) { continuation in
      operation.perRecordResultBlock = { id, result in
        switch result {
        case .success(let record): values.value[id] = record
        case .failure(let error):
          if (error as? CKError)?.code != .unknownItem { failure.value = error }
        }
      }
      operation.fetchRecordsResultBlock = { result in
        // Missing IDs are expected for immutable new records. Other per-record
        // failures must never be mistaken for an empty cloud collection.
        if let error = failure.value { continuation.resume(throwing: error); return }
        if case .failure(let error) = result,
           (error as? CKError)?.code != .partialFailure,
           (error as? CKError)?.code != .unknownItem {
          continuation.resume(throwing: error); return
        }
        continuation.resume(returning: values.value)
      }
    }
  }

  func modify(saving: [CKRecord], deleting: [CKRecord.ID] = [], lease: Int) async throws {
    guard saving.count + deleting.count <= 51 else { throw ICloudFailure.invalidData }
    let operation = CKModifyRecordsOperation(recordsToSave: saving, recordIDsToDelete: deleting)
    operation.savePolicy = .ifServerRecordUnchanged
    operation.isAtomic = true
    let _: Void = try await perform(operation, lease: lease) { continuation in
      installICloudModifyResultBlocks(on: operation) { result in continuation.resume(with: result) }
    }
  }

  func changes(_ zone: CKRecordZone.ID, token: CKServerChangeToken?, lease: Int) async throws -> ICloudChanges {
    let configuration = CKFetchRecordZoneChangesOperation.ZoneConfiguration()
    configuration.previousServerChangeToken = token
    configuration.resultsLimit = 50
    let operation = CKFetchRecordZoneChangesOperation(recordZoneIDs: [zone], configurationsByRecordZoneID: [zone: configuration])
    operation.fetchAllChanges = false
    let values = OperationValues<[CKRecord]>([])
    let zoneResult = OperationValues<Result<ICloudChanges, Error>?>(nil)
    let failure = OperationValues<Error?>(nil)
    return try await perform(operation, lease: lease) { continuation in
      operation.recordWasChangedBlock = { _, result in
        switch result {
        case .success(let record):
          guard values.value.count < 50 else { failure.value = ICloudFailure.invalidData; return }
          values.value.append(record)
        case .failure(let error): failure.value = error
        }
      }
      operation.recordZoneFetchResultBlock = { _, result in
        zoneResult.value = result.map { page in
          ICloudChanges(records: values.value, token: page.serverChangeToken, hasMore: page.moreComing)
        }
      }
      operation.fetchRecordZoneChangesResultBlock = { result in
        if let error = failure.value { continuation.resume(throwing: error); return }
        if let page = zoneResult.value, case .failure(let error) = page {
          continuation.resume(throwing: error); return
        }
        if case .failure(let error) = result { continuation.resume(throwing: error); return }
        guard let page = zoneResult.value else { continuation.resume(throwing: ICloudFailure.unavailable); return }
        continuation.resume(with: page)
      }
    }
  }
}
