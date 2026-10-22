import CloudKit
import Foundation

/// Missing collections are distinct from empty collections. Recovery creates a
/// durable reset fence, never replaces a live root or deletes a live zone.
struct ICloudCollectionAccess {
  let zoneExists: () async throws -> Bool
  let ensureZone: () async throws -> Void
  let fetchRoot: () async throws -> CKRecord?
  let createRoot: (_ recovered: Bool) async throws -> CKRecord
  let wasKnown: () -> Bool
  let remember: () -> Void

  func read(expectedGeneration: String?) async throws -> CKRecord {
    let exists = try await zoneExists()
    if !exists {
      guard expectedGeneration == nil, !wasKnown() else { throw ICloudFailure.zoneRecoveryRequired }
      try await ensureZone()
    }
    if let root = try await fetchRoot() {
      remember()
      return root
    }
    guard expectedGeneration == nil, !wasKnown() else { throw ICloudFailure.zoneRecoveryRequired }
    let root = try await createRoot(false)
    remember()
    return root
  }

  func recover() async throws -> CKRecord {
    let exists: Bool
    do { exists = try await zoneExists() }
    catch {
      guard ICloudFailure.sanitized(error) == .zoneRecoveryRequired else { throw error }
      exists = false
    }
    if !exists { try await ensureZone() }
    let root: CKRecord
    if let current = try await fetchRoot() { root = current }
    else { root = try await createRoot(true) }
    guard (root["closed"] as? NSNumber)?.boolValue != true else { throw ICloudFailure.collectionDeleted }
    guard iCloudWasRecovered(root) else { throw ICloudFailure.conflict }
    remember()
    return root
  }
}
