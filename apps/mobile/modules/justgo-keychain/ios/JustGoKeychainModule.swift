import ExpoModulesCore
import Security

private struct CredentialStoreError: Error, LocalizedError {
  let status: OSStatus
  var errorDescription: String? { "Secure storage unavailable (\(status)). Unlock the device and retry." }
}

public class JustGoKeychainModule: Module {
  private var prefix: String { (Bundle.main.bundleIdentifier ?? "dev.justgo.foundation") + ".identity.v1" }
  // UserDefaults is only an installation marker, never a credential or journal store.
  private func installation() -> String {
    let key = prefix + ".installation"
    if let value = UserDefaults.standard.string(forKey: key) { return value }
    let value = UUID().uuidString
    UserDefaults.standard.set(value, forKey: key)
    return value
  }
  private func query(_ recovery: Bool, _ account: String? = nil) -> [String: Any] {
    var value: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: prefix + (recovery ? ".recovery" : ".device"),
      kSecAttrSynchronizable as String: recovery
    ]
    if let account { value[kSecAttrAccount as String] = account }
    return value
  }
  public func definition() -> ModuleDefinition {
    Name("JustGoKeychain")
    AsyncFunction("readState") { () -> String? in
      var q = self.query(false, self.installation())
      q[kSecReturnData as String] = true
      q[kSecMatchLimit as String] = kSecMatchLimitOne
      var result: CFTypeRef?
      let status = SecItemCopyMatching(q as CFDictionary, &result)
      if status == errSecItemNotFound { return nil }
      guard status == errSecSuccess, let data = result as? Data, let value = String(data: data, encoding: .utf8) else { throw CredentialStoreError(status: status) }
      return value
    }
    AsyncFunction("writeState") { (value: String) in
      let q = self.query(false, self.installation())
      let data = Data(value.utf8)
      let status = SecItemUpdate(q as CFDictionary, [kSecValueData as String: data] as CFDictionary)
      if status == errSecItemNotFound {
        var item = q
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let added = SecItemAdd(item as CFDictionary, nil)
        guard added == errSecSuccess else { throw CredentialStoreError(status: added) }
      } else if status != errSecSuccess { throw CredentialStoreError(status: status) }
    }
    AsyncFunction("listCredentials") { () -> [[String: String]] in
      var q = self.query(true)
      q[kSecReturnAttributes as String] = true
      q[kSecReturnData as String] = true
      q[kSecMatchLimit as String] = kSecMatchLimitAll
      var result: CFTypeRef?
      let status = SecItemCopyMatching(q as CFDictionary, &result)
      if status == errSecItemNotFound { return [] }
      guard status == errSecSuccess, let items = result as? [[String: Any]] else { throw CredentialStoreError(status: status) }
      return try items.map { item in
        guard let id = item[kSecAttrAccount as String] as? String,
              let data = item[kSecValueData as String] as? Data,
              let secret = String(data: data, encoding: .utf8) else { throw CredentialStoreError(status: errSecDecode) }
        return ["id": id, "secret": secret]
      }.sorted { $0["id"]! < $1["id"]! }
    }
    AsyncFunction("addCredential") { (id: String, secret: String) in
      // Append an immutable item for each credential. A late iCloud item cannot overwrite it.
      var q = self.query(true, id)
      q[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlocked
      q[kSecValueData as String] = Data(secret.utf8)
      let status = SecItemAdd(q as CFDictionary, nil)
      if status == errSecDuplicateItem {
        var read = self.query(true, id)
        read[kSecReturnData as String] = true
        read[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let found = SecItemCopyMatching(read as CFDictionary, &result)
        guard found == errSecSuccess, let data = result as? Data, data == Data(secret.utf8) else { throw CredentialStoreError(status: errSecDuplicateItem) }
      } else if status != errSecSuccess { throw CredentialStoreError(status: status) }
    }
  }
}
