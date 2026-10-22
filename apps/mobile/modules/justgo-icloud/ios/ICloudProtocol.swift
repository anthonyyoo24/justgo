import CloudKit
import CryptoKit
import Foundation

enum ICloudFailure: String, Error, LocalizedError {
  case unavailable = "UNAVAILABLE"
  case notConfigured = "NOT_CONFIGURED"
  case notAuthenticated = "NOT_AUTHENTICATED"
  case restricted = "RESTRICTED"
  case quotaExceeded = "QUOTA_EXCEEDED"
  case accountChanged = "ACCOUNT_CHANGED"
  case disabled = "DISABLED"
  case conflict = "CONFLICT"
  case staleGeneration = "STALE_GENERATION"
  case invalidData = "INVALID_DATA"
  case cursorExpired = "CURSOR_EXPIRED"
  case collectionDeleted = "COLLECTION_DELETED"

  var errorDescription: String? { "JUSTGO_ICLOUD_" + rawValue }

  static func sanitized(_ error: Error) -> ICloudFailure {
    if let error = error as? ICloudFailure { return error }
    guard let error = error as? CKError else { return .unavailable }
    switch error.code {
    case .quotaExceeded: return .quotaExceeded
    case .notAuthenticated: return .notAuthenticated
    case .permissionFailure, .managedAccountRestricted: return .restricted
    case .serverRecordChanged, .batchRequestFailed: return .conflict
    case .changeTokenExpired: return .cursorExpired
    case .limitExceeded: return .invalidData
    case .partialFailure:
      let failures = error.partialErrorsByItemID?.values.map(sanitized) ?? []
      for known in [ICloudFailure.quotaExceeded, .notAuthenticated, .restricted, .cursorExpired, .invalidData, .conflict] {
        if failures.contains(known) { return known }
      }
      return .unavailable
    default: return .unavailable
    }
  }

  static func isLimitExceeded(_ error: Error) -> Bool {
    guard let error = error as? CKError, sanitized(error) == .invalidData else { return false }
    if error.code == .limitExceeded { return true }
    guard error.code == .partialFailure else { return false }
    return error.partialErrorsByItemID?.values.contains(where: isLimitExceeded) ?? false
  }
}

struct ICloudValue: Codable, Equatable {
  let id: String
  let value: String

  func validate() throws {
    guard UUID(uuidString: id) != nil, !value.isEmpty,
          value.utf8.count <= 65_536,
          let data = value.data(using: .utf8),
          (try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])) != nil
    else { throw ICloudFailure.invalidData }
  }
}

struct ICloudCursor: Codable {
  let collection: String
  let generation: String
  let token: String

  static func decode(_ value: String?, collection: String, generation: String) throws -> CKServerChangeToken? {
    guard let value else { return nil }
    guard value.utf8.count <= 32_768, let data = Data(base64Encoded: value),
          let cursor = try? JSONDecoder().decode(ICloudCursor.self, from: data),
          cursor.collection == collection,
          let tokenData = Data(base64Encoded: cursor.token),
          let token = try? NSKeyedUnarchiver.unarchivedObject(ofClass: CKServerChangeToken.self, from: tokenData)
    else { throw ICloudFailure.invalidData }
    guard cursor.generation == generation else { throw ICloudFailure.staleGeneration }
    return token
  }

  static func encode(_ token: CKServerChangeToken, collection: String, generation: String) throws -> String {
    let tokenData = try NSKeyedArchiver.archivedData(withRootObject: token, requiringSecureCoding: true)
    let cursor = ICloudCursor(collection: collection, generation: generation, token: tokenData.base64EncodedString())
    let output = try JSONEncoder().encode(cursor).base64EncodedString()
    guard output.utf8.count <= 32_768 else { throw ICloudFailure.unavailable }
    return output
  }
}

func iCloudHash(_ value: String) -> String {
  SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
}

func iCloudGeneration(_ root: CKRecord) throws -> String {
  guard root.recordType == "JustGoCollection", let value = root["generation"] as? String,
        UUID(uuidString: value) != nil else { throw ICloudFailure.invalidData }
  return value
}

func iCloudJSON(_ value: [String: Any]) throws -> String {
  guard JSONSerialization.isValidJSONObject(value),
        let text = String(data: try JSONSerialization.data(withJSONObject: value), encoding: .utf8)
  else { throw ICloudFailure.invalidData }
  return text
}
