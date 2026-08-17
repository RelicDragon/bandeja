import Foundation
import Security

nonisolated final class KeychainHelper: @unchecked Sendable {
    static let shared = KeychainHelper()

    // Must match the access group configured in both iOS and watchOS entitlements.
    static let accessGroup = "group.com.funified.bandeja"

    private init() {}

    private let service = "com.funified.bandeja.jwt"
    private let refreshService = "com.funified.bandeja.refresh"

    @discardableResult
    private func writeCredential(token: String, service: String, accessGroup: String) -> Bool {
        guard let data = token.data(using: .utf8) else { return false }
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccessGroup: accessGroup
        ]
        let update: [CFString: Any] = [
            kSecValueData: data,
            kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlock
        ]
        let status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecSuccess { return true }
        guard status == errSecItemNotFound else { return false }
        var insert = query
        insert[kSecValueData] = data
        insert[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlock
        return SecItemAdd(insert as CFDictionary, nil) == errSecSuccess
    }

    private func readCredential(service: String, accessGroup: String) -> String? {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccessGroup: accessGroup,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    // MARK: - Token (compatible with the format written by the iOS AuthBridgePlugin)

    @discardableResult
    func write(token: String, accessGroup: String = KeychainHelper.accessGroup) -> Bool {
        writeCredential(token: token, service: service, accessGroup: accessGroup)
    }

    func readToken(accessGroup: String = KeychainHelper.accessGroup) -> String? {
        readCredential(service: service, accessGroup: accessGroup)
    }

    func readRefreshToken(accessGroup: String = KeychainHelper.accessGroup) -> String? {
        readCredential(service: refreshService, accessGroup: accessGroup)
    }

    @discardableResult
    func writeRefreshToken(token: String, accessGroup: String = KeychainHelper.accessGroup) -> Bool {
        writeCredential(token: token, service: refreshService, accessGroup: accessGroup)
    }

    func deleteToken(accessGroup: String = KeychainHelper.accessGroup) {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccessGroup: accessGroup
        ]
        SecItemDelete(query as CFDictionary)
    }

    // MARK: - Current User ID (decoded from the JWT payload — no extra Keychain item needed)

    func readUserId() -> String? {
        guard let token = readToken() else { return nil }
        return decodeUserId(from: token)
    }

    // MARK: - JWT Payload Decoding

    private func decodeUserId(from token: String) -> String? {
        let parts = token.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3 else { return nil }

        // JWT uses base64url: no padding, `-` → `+`, `_` → `/`
        var base64 = parts[1]
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let remainder = base64.count % 4
        if remainder != 0 { base64 += String(repeating: "=", count: 4 - remainder) }

        guard let data = Data(base64Encoded: base64),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let userId = json["userId"] as? String else { return nil }
        return userId
    }
}
