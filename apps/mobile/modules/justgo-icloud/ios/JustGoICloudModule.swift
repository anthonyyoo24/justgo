import CloudKit
import ExpoModulesCore
import Foundation

public final class JustGoICloudModule: Module {
  private let store = ICloudStore(containerIdentifier: Bundle.main.object(forInfoDictionaryKey: "JustGoICloudContainerIdentifier") as? String)
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("JustGoICloud")
    Events("onAccountChanged")
    OnCreate {
      self.observer = NotificationCenter.default.addObserver(forName: .CKAccountChanged, object: nil, queue: nil) { [weak self] _ in
        guard let self else { return }
        Task {
          await self.store.stop()
          self.sendEvent("onAccountChanged", [:])
        }
      }
    }
    OnDestroy {
      if let observer = self.observer { NotificationCenter.default.removeObserver(observer) }
      let store = self.store
      Task { await store.stop() }
    }
    AsyncFunction("status") { () async throws -> String in
      do { return try await self.store.status() }
      catch { throw ICloudFailure.sanitized(error) }
    }
    AsyncFunction("configure") { (enabled: Bool, accountToken: String?) async throws -> String in
      do { return try await self.store.configure(enabled, expectedAccountToken: accountToken) }
      catch { throw ICloudFailure.sanitized(error) }
    }
    AsyncFunction("read") { (collection: String, cursor: String?) async throws -> String in
      do { return try await self.store.read(collection, cursor: cursor) }
      catch { throw ICloudFailure.sanitized(error) }
    }
    AsyncFunction("write") { (collection: String, generation: String, records: String) async throws -> String in
      do { return try await self.store.write(collection, expectedGeneration: generation, encodedRecords: records) }
      catch { throw ICloudFailure.sanitized(error) }
    }
    AsyncFunction("reset") { (collection: String, generation: String) async throws -> String in
      do { return try await self.store.reset(collection, expectedGeneration: generation) }
      catch { throw ICloudFailure.sanitized(error) }
    }
    AsyncFunction("resetIfUnchanged") { (collection: String, generation: String, revision: String) async throws -> String in
      do { return try await self.store.reset(collection, expectedGeneration: generation, expectedRevision: revision) }
      catch { throw ICloudFailure.sanitized(error) }
    }
    AsyncFunction("close") { (collection: String, generation: String) async throws -> String in
      do { return try await self.store.close(collection, expectedGeneration: generation) }
      catch { throw ICloudFailure.sanitized(error) }
    }
    AsyncFunction("purge") { (collection: String, generation: String, cursor: String?) async throws -> String in
      do { return try await self.store.purge(collection, expectedGeneration: generation, cursor: cursor) }
      catch { throw ICloudFailure.sanitized(error) }
    }
  }
}
