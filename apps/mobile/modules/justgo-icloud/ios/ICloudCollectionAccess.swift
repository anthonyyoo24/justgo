import CloudKit
import Foundation

/// Called only with an enabled, account-pinned native lease. Removing an iCloud
/// copy does not authorize deleting phone entries: recreate only absent storage.
struct ICloudCollectionAccess {
  let zoneExists: () async throws -> Bool
  let ensureZone: () async throws -> Void
  let fetchRoot: () async throws -> CKRecord?
  let createRoot: () async throws -> CKRecord

  func read() async throws -> CKRecord {
    let exists: Bool
    do { exists = try await zoneExists() }
    catch {
      guard ICloudFailure.sanitized(error) == .zoneRecoveryRequired else { throw error }
      exists = false
    }
    if !exists { try await ensureZone() }
    if let current = try await fetchRoot() { return current }
    return try await createRoot()
  }
}
