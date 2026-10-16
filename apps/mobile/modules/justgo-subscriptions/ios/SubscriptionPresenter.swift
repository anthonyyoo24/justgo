import StoreKit
import UIKit

enum SubscriptionPresentationError: Error {
  case noActiveScene
  case alreadyPresenting
}

@MainActor enum SubscriptionPresenter {
  private static var presenting = false

  static func present(in scene: UIWindowScene) async throws {
    guard !presenting else { throw SubscriptionPresentationError.alreadyPresenting }
    presenting = true
    defer { presenting = false }

    // StoreKit's verified records belong to this app and the current Apple customer.
    // They only select Apple's UI; they never authorize JustGO account/data access.
    var groups = Set<String>()
    for await entitlement in Transaction.currentEntitlements {
      if case .verified(let transaction) = entitlement,
         transaction.productType == .autoRenewable,
         transaction.revocationDate == nil,
         let group = transaction.subscriptionGroupID {
        groups.insert(group)
      }
    }
    if #available(iOS 17.0, *), groups.count == 1, let group = groups.first {
      try await AppStore.showManageSubscriptions(in: scene, subscriptionGroupID: group)
    } else {
      // Older iOS, no verified subscription or ambiguous groups: Apple lists them.
      try await AppStore.showManageSubscriptions(in: scene)
    }
    // Dismissal does not establish cancellation. Apple owns the final confirmation.
  }
}
