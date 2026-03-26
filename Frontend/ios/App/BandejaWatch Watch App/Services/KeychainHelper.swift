import Foundation
import Security

final class KeychainHelper: @unchecked Sendable {
    static let shared = KeychainHelper()

    // Must match the access group configured in both iOS and watchOS entitlements.
    static let accessGroup = "group.com.funified.bandeja"

    private init() {}

    private let service = "com.funified.bandeja.jwt"

    // MARK: - Token (compatible with the format written by the iOS AuthBridgePlugin)

    func write(token: String, accessGroup: String = KeychainHelper.accessGroup) {
        guard let data = token.data(using: .utf8) else { return }
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccessGroup: accessGroup,
            kSecValueData: data,
            kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlock
        ]
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }

    func readToken(accessGroup: String = KeychainHelper.accessGroup) -> String? {
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
