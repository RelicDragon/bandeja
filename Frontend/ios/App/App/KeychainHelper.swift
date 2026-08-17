import Foundation
import Security

final class KeychainHelper {
    static let shared = KeychainHelper()
    private init() {}

    private let service = "com.funified.bandeja.jwt"
    private let refreshService = "com.funified.bandeja.refresh"

    private func writeCredential(token: String, service: String, accessGroup: String) -> Bool {
        let data = Data(token.utf8)
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccessGroup: accessGroup
        ]
        let update: [CFString: Any] = [
            kSecValueData: data,
            kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlock
        ]
        let updateStatus = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if updateStatus == errSecSuccess { return true }
        guard updateStatus == errSecItemNotFound else { return false }
        var insert = query
        insert[kSecValueData] = data
        insert[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlock
        return SecItemAdd(insert as CFDictionary, nil) == errSecSuccess
    }

    private func readCredential(service: String, accessGroup: String) -> (status: OSStatus, token: String?) {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccessGroup: accessGroup,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else {
            return (status, nil)
        }
        return (status, String(data: data, encoding: .utf8))
    }

    @discardableResult
    func write(token: String, accessGroup: String) -> Bool {
        writeCredential(token: token, service: service, accessGroup: accessGroup)
    }

    func readToken(accessGroup: String) -> String? {
        readCredential(service: service, accessGroup: accessGroup).token
    }

    @discardableResult
    func deleteToken(accessGroup: String) -> Bool {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccessGroup: accessGroup
        ]
        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }

    @discardableResult
    func writeRefreshToken(token: String, accessGroup: String) -> Bool {
        writeCredential(token: token, service: refreshService, accessGroup: accessGroup)
    }

    func readRefreshToken(accessGroup: String) -> String? {
        readCredential(service: refreshService, accessGroup: accessGroup).token
    }

    func readRefreshTokenResult(accessGroup: String) -> (status: OSStatus, token: String?) {
        readCredential(service: refreshService, accessGroup: accessGroup)
    }

    @discardableResult
    func deleteRefreshToken(accessGroup: String) -> Bool {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: refreshService,
            kSecAttrAccessGroup: accessGroup
        ]
        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }
}
