import CloudKit
import XCTest
@testable import JustGoICloud

private final class CollectionFixture {
  var exists = false
  var root: CKRecord?
  var zoneFailure: Error?
  var ensureFailure: Error?
  var fetchFailure: Error?
  var creates = 0
  var ensures = 0

  func access() -> ICloudCollectionAccess {
    // Production supplies these closures only after obtaining its enabled,
    // account-pinned native lease. The fixture exercises collection access.
    ICloudCollectionAccess(
      zoneExists: { if let error = self.zoneFailure { throw error }; return self.exists },
      ensureZone: {
        self.ensures += 1
        if let error = self.ensureFailure { throw error }
        self.exists = true
      },
      fetchRoot: { if let error = self.fetchFailure { throw error }; return self.root },
      createRoot: {
        self.creates += 1
        let root = CKRecord(recordType: "JustGoCollection")
        root["generation"] = UUID().uuidString as NSString
        root["wasReset"] = NSNumber(value: ICloudResetMarker.none.rawValue)
        self.root = root
        return root
      }
    )
  }
}

final class ICloudCollectionAccessTests: XCTestCase {
  func testMissingZoneOrRootCreatesAnEmptyCopyWithoutADeletionMarker() async throws {
    for exists in [false, true] {
      let fixture = CollectionFixture()
      fixture.exists = exists
      let root = try await fixture.access().read()
      XCTAssertEqual((root["wasReset"] as? NSNumber)?.intValue, 0)
      XCTAssertFalse(iCloudWasRecovered(root))
      XCTAssertEqual(fixture.creates, 1)
      XCTAssertEqual(fixture.ensures, exists ? 0 : 1)
      XCTAssertTrue(fixture.exists)
    }
  }

  func testReadRetryPreservesTheCreatedGeneration() async throws {
    let fixture = CollectionFixture()
    let first = try await fixture.access().read()
    let second = try await fixture.access().read()
    XCTAssertEqual(try iCloudGeneration(first), try iCloudGeneration(second))
    XCTAssertTrue(first === second)
    XCTAssertEqual(fixture.creates, 1)
    XCTAssertEqual(fixture.ensures, 1)
  }

  func testReadNeverReplacesALiveOrClosedRoot() async throws {
    for closed in [false, true] {
      for marker in [0, 1, 2] {
        let fixture = CollectionFixture()
        fixture.exists = true
        let root = CKRecord(recordType: "JustGoCollection")
        root["generation"] = UUID().uuidString as NSString
        root["wasReset"] = NSNumber(value: marker)
        root["closed"] = NSNumber(value: closed)
        fixture.root = root
        let read = try await fixture.access().read()
        XCTAssertTrue(read === root)
        XCTAssertEqual((read["wasReset"] as? NSNumber)?.intValue, marker)
        XCTAssertEqual((read["closed"] as? NSNumber)?.boolValue, closed)
        XCTAssertEqual(fixture.creates, 0)
        XCTAssertEqual(fixture.ensures, 0)
      }
    }
  }

  func testUserDeletedZoneAndEncryptedDataResetRecreateOnlyTheCloudCopy() async throws {
    for error in [CKError(.userDeletedZone), CKError(.zoneNotFound, userInfo: [CKErrorUserDidResetEncryptedDataKey: NSNumber(value: true)])] {
      let fixture = CollectionFixture()
      fixture.zoneFailure = error
      let root = try await fixture.access().read()
      XCTAssertEqual((root["wasReset"] as? NSNumber)?.intValue, 0)
      XCTAssertFalse(iCloudWasRecovered(root))
      XCTAssertEqual(fixture.creates, 1)
      XCTAssertEqual(fixture.ensures, 1)
    }
  }

  func testNetworkAndQuotaFailuresCannotCreateAReplacement() async {
    for failure in [CKError(.networkFailure), CKError(.quotaExceeded)] {
      for operation in ["zone", "ensure", "fetch"] {
        let fixture = CollectionFixture()
        switch operation {
        case "zone": fixture.zoneFailure = failure
        case "ensure": fixture.ensureFailure = failure
        default:
          fixture.exists = true
          fixture.fetchFailure = failure
        }
        do {
          _ = try await fixture.access().read()
          XCTFail("A failed read cannot create replacement storage")
        } catch { XCTAssertEqual(ICloudFailure.sanitized(error), ICloudFailure.sanitized(failure)) }
        XCTAssertEqual(fixture.creates, 0)
        XCTAssertEqual(fixture.ensures, operation == "ensure" ? 1 : 0)
      }
    }
  }

  func testAppDeletionSupersedesEveryLegacyResetMarker() {
    for marker in [0, 1, 2] {
      let root = CKRecord(recordType: "JustGoCollection")
      root["wasReset"] = NSNumber(value: marker)
      iCloudMarkReset(root)
      XCTAssertFalse(iCloudWasRecovered(root))
      XCTAssertEqual((root["wasReset"] as? NSNumber)?.intValue, 1)
    }
  }
}
