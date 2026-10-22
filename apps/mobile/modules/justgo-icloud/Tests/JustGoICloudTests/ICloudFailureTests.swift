import CloudKit
import XCTest
@testable import JustGoICloud

final class ICloudFailureTests: XCTestCase {
  private let zone = CKRecordZone.ID(zoneName: "Synthetic", ownerName: CKCurrentUserDefaultName)

  func testExpiredCursorSurvivesOperationAndNestedPartialFailures() {
    let expired = CKError(.changeTokenExpired)
    let zoneFailure = CKError(.partialFailure, userInfo: [CKPartialErrorsByItemIDKey: [zone: expired]])
    let nested = CKError(.partialFailure, userInfo: [CKPartialErrorsByItemIDKey: [zone: zoneFailure]])
    for error in [expired, zoneFailure, nested] {
      XCTAssertEqual(ICloudFailure.sanitized(error), .cursorExpired)
      XCTAssertEqual(ICloudFailure.sanitized(error).errorDescription, "JUSTGO_ICLOUD_CURSOR_EXPIRED")
    }
  }

  func testPartialFailuresRetainQuotaAndAuthenticationPriority() {
    let record = CKRecord.ID(recordName: "Synthetic", zoneID: zone)
    let error = CKError(.partialFailure, userInfo: [CKPartialErrorsByItemIDKey: [
      zone: CKError(.changeTokenExpired), record: CKError(.quotaExceeded)
    ]])
    XCTAssertEqual(ICloudFailure.sanitized(error), .quotaExceeded)
    XCTAssertEqual(ICloudFailure.sanitized(CKError(.notAuthenticated)), .notAuthenticated)
  }

  func testLimitExceededIsRecognizedInsideAtomicPartialFailure() {
    let record = CKRecord.ID(recordName: "Synthetic", zoneID: zone)
    let error = CKError(.partialFailure, userInfo: [CKPartialErrorsByItemIDKey: [
      zone: CKError(.batchRequestFailed), record: CKError(.limitExceeded)
    ]])
    XCTAssertTrue(ICloudFailure.isLimitExceeded(error))
    XCTAssertEqual(ICloudFailure.sanitized(error), .invalidData)
    XCTAssertEqual(ICloudFailure.sanitized(CKError(.limitExceeded)), .invalidData)
    XCTAssertFalse(ICloudFailure.isLimitExceeded(CKError(.networkFailure)))
    XCTAssertFalse(ICloudFailure.isLimitExceeded(ICloudFailure.disabled))
    let quota = CKError(.partialFailure, userInfo: [CKPartialErrorsByItemIDKey: [
      zone: CKError(.quotaExceeded), record: CKError(.limitExceeded)
    ]])
    XCTAssertFalse(ICloudFailure.isLimitExceeded(quota))
  }

  func testUnknownErrorsRemainSanitized() {
    let error = NSError(domain: "Synthetic", code: 1, userInfo: [NSLocalizedDescriptionKey: "private fixture detail"])
    XCTAssertEqual(ICloudFailure.sanitized(error), .unavailable)
    XCTAssertEqual(ICloudFailure.sanitized(error).errorDescription, "JUSTGO_ICLOUD_UNAVAILABLE")
  }
}
