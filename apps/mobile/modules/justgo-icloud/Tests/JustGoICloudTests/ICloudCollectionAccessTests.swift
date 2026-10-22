import CloudKit
import XCTest
@testable import JustGoICloud

private final class CollectionFixture {
  var exists = false
  var known = false
  var root: CKRecord?
  var failure: Error?
  var creates = 0
  var ensures = 0

  func access() -> ICloudCollectionAccess {
    ICloudCollectionAccess(
      zoneExists: { if let error = self.failure { throw error }; return self.exists },
      ensureZone: { self.ensures += 1; self.exists = true },
      fetchRoot: { self.root },
      createRoot: { recovered in
        self.creates += 1
        let root = CKRecord(recordType: "JustGoCollection")
        root["generation"] = UUID().uuidString as NSString
        root["wasReset"] = NSNumber(value: recovered ? ICloudResetMarker.externalRecovery.rawValue : 0)
        self.root = root
        return root
      },
      wasKnown: { self.known },
      remember: { self.known = true }
    )
  }
}

final class ICloudCollectionAccessTests: XCTestCase {
  func testFirstUseCreatesAnEmptyCollectionButNeverMarksItRecovered() async throws {
    let fixture = CollectionFixture()
    let root = try await fixture.access().read(expectedGeneration: nil)
    XCTAssertFalse(iCloudWasRecovered(root))
    XCTAssertTrue(fixture.known)
    XCTAssertEqual(fixture.creates, 1)
    XCTAssertEqual(fixture.ensures, 1)
  }

  func testKnownMissingZoneOrRootNeverAutomaticallyRecreates() async {
    for exists in [false, true] {
      for remembered in [false, true] {
        let fixture = CollectionFixture()
        fixture.exists = exists
        fixture.known = remembered
        do {
          _ = try await fixture.access().read(expectedGeneration: remembered ? nil : UUID().uuidString)
          XCTFail("Missing known collection must require recovery")
        } catch { XCTAssertEqual(ICloudFailure.sanitized(error), .zoneRecoveryRequired) }
        XCTAssertEqual(fixture.creates, 0)
        XCTAssertEqual(fixture.ensures, 0)
      }
    }
  }

  func testExplicitRecoveryCreatesDurableFenceAndRetryKeepsSameGeneration() async throws {
    let fixture = CollectionFixture()
    let first = try await fixture.access().recover()
    let second = try await fixture.access().recover()
    XCTAssertTrue(iCloudWasRecovered(first))
    XCTAssertEqual(try iCloudGeneration(first), try iCloudGeneration(second))
    XCTAssertEqual(fixture.creates, 1)
    XCTAssertEqual(fixture.ensures, 1)
    XCTAssertTrue(fixture.known)
  }

  func testRecoveryNeverReplacesLiveNormalOrClosedRoot() async throws {
    for closed in [false, true] {
      let fixture = CollectionFixture()
      let root = try await fixture.access().read(expectedGeneration: nil)
      root["closed"] = NSNumber(value: closed)
      do {
        _ = try await fixture.access().recover()
        XCTFail("Live roots cannot be replaced")
      } catch { XCTAssertEqual(ICloudFailure.sanitized(error), closed ? .collectionDeleted : .conflict) }
      XCTAssertEqual(fixture.creates, 1)
    }
  }

  func testResetKeyAndUserDeletionRequireConsentEvenWithoutLocalHistory() async throws {
    for error in [CKError(.userDeletedZone), CKError(.zoneNotFound, userInfo: [CKErrorUserDidResetEncryptedDataKey: NSNumber(value: true)])] {
      let fixture = CollectionFixture()
      fixture.failure = error
      do {
        _ = try await fixture.access().read(expectedGeneration: nil)
        XCTFail("Reset must not silently recreate")
      } catch { XCTAssertEqual(ICloudFailure.sanitized(error), .zoneRecoveryRequired) }
      XCTAssertEqual(fixture.creates, 0)
      let root = try await fixture.access().recover()
      XCTAssertTrue(iCloudWasRecovered(root))
    }
  }

  func testNetworkAndQuotaFailuresCannotTriggerRecoveryCreation() async {
    for error in [CKError(.networkFailure), CKError(.quotaExceeded)] {
      let fixture = CollectionFixture()
      fixture.failure = error
      do {
        _ = try await fixture.access().recover()
        XCTFail("Failure must stay closed")
      } catch { XCTAssertEqual(ICloudFailure.sanitized(error), ICloudFailure.sanitized(fixture.failure!)) }
      XCTAssertEqual(fixture.creates, 0)
      XCTAssertEqual(fixture.ensures, 0)
    }
  }

  func testOrdinaryResetsCannotDowngradeTheExternalRecoveryFence() async throws {
    let fixture = CollectionFixture()
    let root = try await fixture.access().recover()
    iCloudMarkReset(root)
    XCTAssertTrue(iCloudWasRecovered(root))
    let ordinary = CKRecord(recordType: "JustGoCollection")
    iCloudMarkReset(ordinary)
    XCTAssertFalse(iCloudWasRecovered(ordinary))
    XCTAssertEqual((ordinary["wasReset"] as? NSNumber)?.intValue, 1)
  }
}
