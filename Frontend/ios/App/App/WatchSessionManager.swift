import Foundation
import WatchConnectivity

final class WatchSessionManager: NSObject {
    static let shared = WatchSessionManager()

    private static let keychainAccessGroup = "group.com.funified.bandeja"
    private static let prefsStorageKey = "bandeja.watch.preferenceFields"

    private let session = WCSession.default
    private var lastToken: String?

    private override init() {
        super.init()
        if WCSession.isSupported() {
            session.delegate = self
            session.activate()
        }
    }

    func sendToken(_ token: String) {
        lastToken = token
        flushSyncPayloadIfPossible()
    }

    func resyncTokenFromKeychainToWatch() {
        guard let token = KeychainHelper.shared.readToken(accessGroup: Self.keychainAccessGroup) else { return }
        sendToken(token)
    }

    func setWatchPreferences(
        language: String?,
        weekStart: String?,
        defaultCurrency: String?,
        timeFormat: String?
    ) {
        var fields = UserDefaults.standard.dictionary(forKey: Self.prefsStorageKey) ?? [:]
        func put(_ key: String, _ value: String?) {
            if let value, !value.isEmpty {
                fields[key] = value
            } else {
                fields.removeValue(forKey: key)
            }
        }
        put("language", language)
        put("weekStart", weekStart)
        put("defaultCurrency", defaultCurrency)
        put("timeFormat", timeFormat)
        fields["prefsVersion"] = Date().timeIntervalSince1970
        UserDefaults.standard.set(fields, forKey: Self.prefsStorageKey)
        flushSyncPayloadIfPossible()
    }

    func sendLogout() {
        lastToken = nil
        UserDefaults.standard.removeObject(forKey: Self.prefsStorageKey)
        guard session.activationState == .activated else { return }
        guard shouldAttemptWatchSync else { return }
        session.transferUserInfo(["event": "logout"])
        try? session.updateApplicationContext(["event": "logout"])
    }

    private var shouldAttemptWatchSync: Bool {
        #if targetEnvironment(simulator)
        true
        #else
        session.isWatchAppInstalled
        #endif
    }

    private func currentTokenForSync() -> String? {
        if let t = lastToken, !t.isEmpty { return t }
        return KeychainHelper.shared.readToken(accessGroup: Self.keychainAccessGroup)
    }

    private func buildSyncDictionary() -> [String: Any] {
        var payload = UserDefaults.standard.dictionary(forKey: Self.prefsStorageKey) ?? [:]
        payload.removeValue(forKey: "token")
        payload.removeValue(forKey: "event")
        if let token = currentTokenForSync(), !token.isEmpty {
            payload["token"] = token
        }
        return payload
    }

    private func flushSyncPayloadIfPossible() {
        guard session.activationState == .activated else { return }
        guard shouldAttemptWatchSync else { return }
        let payload = buildSyncDictionary()
        if payload["token"] == nil {
            let hasPrefs = payload["language"] != nil || payload["weekStart"] != nil
                || payload["defaultCurrency"] != nil || payload["timeFormat"] != nil
            if !hasPrefs { return }
        }
        session.transferUserInfo(payload)
        try? session.updateApplicationContext(payload)
    }
}

extension WatchSessionManager: WCSessionDelegate {
    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    func session(_ session: WCSession,
                 activationDidCompleteWith activationState: WCSessionActivationState,
                 error: (any Error)?) {
        if activationState == .activated {
            flushSyncPayloadIfPossible()
        }
    }

    func sessionWatchStateDidChange(_ session: WCSession) {
        flushSyncPayloadIfPossible()
    }
}
