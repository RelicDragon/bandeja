import Foundation
import WatchConnectivity

enum WatchConnectivityEvent {
    static let liveScoringRelay = "liveScoringRelay"
    static let matchTimerRelay = "matchTimerRelay"
    static let scoreUpdated = "scoreUpdated"
}

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

    func relayLiveScoring(gameId: String, matchId: String, liveScoring: [String: Any]?) {
        guard session.activationState == .activated else { return }
        guard shouldAttemptWatchSync else { return }

        let revision = Self.parseRevision(from: liveScoring)
        var payload: [String: Any] = [
            "event": WatchConnectivityEvent.liveScoringRelay,
            "gameId": gameId,
            "matchId": matchId,
            "revision": revision,
        ]
        if let liveScoring {
            payload["liveScoring"] = liveScoring
        } else {
            payload["liveScoring"] = NSNull()
        }

        if Self.payloadExceedsRelayLimit(payload) {
            payload.removeValue(forKey: "liveScoring")
        }

        session.transferUserInfo(payload)
    }

    func relayMatchTimer(gameId: String, matchId: String, snapshot: [String: Any]) {
        guard session.activationState == .activated else { return }
        guard shouldAttemptWatchSync else { return }

        let payload: [String: Any] = [
            "event": WatchConnectivityEvent.matchTimerRelay,
            "gameId": gameId,
            "matchId": matchId,
            "snapshot": snapshot,
        ]
        session.transferUserInfo(payload)
    }

    private static func parseRevision(from liveScoring: [String: Any]?) -> Int {
        guard let liveScoring else { return 0 }
        if let revision = liveScoring["revision"] as? Int { return revision }
        if let revision = liveScoring["revision"] as? Double { return Int(revision) }
        return 0
    }

    private static let relayPayloadLimitBytes = 60_000

    private static func payloadExceedsRelayLimit(_ payload: [String: Any]) -> Bool {
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload) else {
            return true
        }
        return data.count > relayPayloadLimitBytes
    }

    private func handleIncomingUserInfo(_ userInfo: [String: Any]) {
        guard userInfo["event"] as? String == WatchConnectivityEvent.scoreUpdated else { return }
        guard let gameId = userInfo["gameId"] as? String,
              let matchId = userInfo["matchId"] as? String else { return }
        var payload: [String: Any] = [
            "gameId": gameId,
            "matchId": matchId,
        ]
        if let revision = userInfo["revision"] as? Int {
            payload["revision"] = revision
        } else if let revision = userInfo["revision"] as? Double {
            payload["revision"] = Int(revision)
        }
        NotificationCenter.default.post(name: .watchScoreUpdated, object: nil, userInfo: payload)
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

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        handleIncomingUserInfo(userInfo)
    }
}
