import Foundation
import WatchConnectivity
import BandejaNextGames
import BandejaWatchShared

final class WatchSessionManager: NSObject {
    static let shared = WatchSessionManager()

    private static let prefsStorageKey = "bandeja.watch.preferenceFields"

    private let session = WCSession.default
    private var lastToken: String?
    private var lastRefreshToken: String?

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

    /// Forwards the long-lived refresh credential so the watch can mint fresh
    /// access tokens on its own (e.g. mid-game, while the iPhone app is suspended).
    func sendRefreshToken(_ token: String) {
        lastRefreshToken = token
        flushSyncPayloadIfPossible()
    }

    func deleteWatchRefreshToken() {
        lastRefreshToken = nil
        KeychainHelper.shared.deleteRefreshToken(accessGroup: AppGroupStorage.suiteName)
        flushSyncPayloadIfPossible()
    }

    func resyncTokenFromKeychainToWatch() {
        if let token = KeychainHelper.shared.readToken(accessGroup: AppGroupStorage.suiteName) {
            lastToken = token
        }
        if let refresh = KeychainHelper.shared.readRefreshToken(accessGroup: AppGroupStorage.suiteName) {
            lastRefreshToken = refresh
        }
        flushSyncPayloadIfPossible()
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
        lastRefreshToken = nil
        UserDefaults.standard.removeObject(forKey: Self.prefsStorageKey)
        guard session.activationState == .activated else { return }
        guard shouldAttemptWatchSync else { return }
        // Application context is last-write-wins. Do not queue logout via transferUserInfo —
        // a delayed FIFO message can wipe a newer post-login access token.
        let payload = WatchAuthSyncPayload.logoutPayload()
        try? session.updateApplicationContext(payload)
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
        return KeychainHelper.shared.readToken(accessGroup: AppGroupStorage.suiteName)
    }

    private func currentRefreshTokenForSync() -> String? {
        if let t = lastRefreshToken, !t.isEmpty { return t }
        return KeychainHelper.shared.readRefreshToken(accessGroup: AppGroupStorage.suiteName)
    }

    private func buildSyncDictionary() -> [String: Any] {
        let fields = UserDefaults.standard.dictionary(forKey: Self.prefsStorageKey) ?? [:]
        let payload = WatchAuthSyncPayload(
            token: currentTokenForSync(),
            refreshToken: currentRefreshTokenForSync(),
            language: fields["language"] as? String,
            weekStart: fields["weekStart"] as? String,
            defaultCurrency: fields["defaultCurrency"] as? String,
            timeFormat: fields["timeFormat"] as? String,
            prefsVersion: (fields["prefsVersion"] as? Double)
                ?? (fields["prefsVersion"] as? Int).map { Double($0) }
        )
        return payload.encode()
    }

    private func flushSyncPayloadIfPossible() {
        guard session.activationState == .activated else { return }
        guard shouldAttemptWatchSync else { return }
        let payload = buildSyncDictionary()
        if payload["token"] == nil, payload["refreshToken"] == nil {
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

        var payload = LiveScoringRelayPayload(
            gameId: gameId,
            matchId: matchId,
            revision: LiveScoringRelayPayload.parseRevision(from: liveScoring),
            liveScoring: liveScoring
        ).encode()

        if WatchConnectivityRelayLimits.exceedsLimit(payload) {
            payload.removeValue(forKey: "liveScoring")
        }

        session.transferUserInfo(payload)
    }

    func relayMatchTimer(gameId: String, matchId: String, snapshot: [String: Any]) {
        guard session.activationState == .activated else { return }
        guard shouldAttemptWatchSync else { return }

        let payload = MatchTimerRelayPayload(
            gameId: gameId,
            matchId: matchId,
            snapshot: snapshot
        ).encode()
        session.transferUserInfo(payload)
    }

    private func handleIncomingUserInfo(_ userInfo: [String: Any]) {
        guard let score = ScoreUpdatedPayload(decode: userInfo) else { return }
        NotificationCenter.default.post(
            name: .watchScoreUpdated,
            object: nil,
            userInfo: score.notificationUserInfo
        )
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
