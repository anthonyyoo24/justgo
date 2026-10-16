import ExpoModulesCore

public class JustGoSubscriptionsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("JustGoSubscriptions")
    AsyncFunction("openSubscriptionManagement") { () async throws in
      try await self.presentSubscriptions()
    }
  }

  @MainActor private func presentSubscriptions() async throws {
    guard let scene = appContext?.utilities?.currentViewController()?.view.window?.windowScene else {
      throw SubscriptionPresentationError.noActiveScene
    }
    try await SubscriptionPresenter.present(in: scene)
  }
}
