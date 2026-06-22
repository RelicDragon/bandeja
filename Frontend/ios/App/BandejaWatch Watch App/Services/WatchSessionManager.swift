import WatchConnectivity
import Observation
import BandejaWatchShared

private enum WatchConnectivityPayload {
    nonisolated static func relayPayload(from dict: [String: Any]) -> Data? {
        guard JSONSerialization.isValidJSONObject(dict) else { return nil }
        return try? JSONSerialization.data(withJSONObject: dict)
    }

    nonisolated static func apply(_ dict: [String: Any]) {
        if dict["event"] as? String == WatchConnectivityEvent.liveScoringRelay {
            guard LiveScoringRelayPayload(decode: dict) != nil else { return }
            guard let data = relayPayload(from: dict) else { return }
            Task { @MainActor in
                guard let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
                WatchLiveScoringRelayStore.shared.ingest(payload)
            }
            return
        }
        if dict["event"] as? String == WatchConnectivityEvent.matchTimerRelay {
            guard MatchTimerRelayPayload(decode: dict) != nil else { return }
            guard let data = relayPayload(from: dict) else { return }
            Task { @MainActor in
                guard let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
                WatchMatchTimerRelayStore.shared.ingest(payload)
            }
            return
        }

        guard let auth = WatchAuthSyncPayload(decode: dict) else { return }

        Task { @MainActor in
            if auth.isLogout {
                KeychainHelper.shared.deleteToken()
                WatchPreferencesStore.shared.clear()
                NetworkDeliveryOutbox.shared.clear()
                WatchSessionManager.shared.logoutDidArrive.toggle()
                return
            }
            if let token = auth.token, !token.isEmpty {
                KeychainHelper.shared.write(token: token)
                if auth.hasPreferences {
                    WatchPreferencesStore.shared.applyFromPhone(
                        language: auth.language,
                        weekStart: auth.weekStart,
                        defaultCurrency: auth.defaultCurrency,
                        timeFormat: auth.timeFormat,
                        prefsVersion: auth.prefsVersion
                    )
                }
                WatchSessionManager.shared.tokenDidArrive.toggle()
            } else if auth.hasPreferences {
                WatchPreferencesStore.shared.applyFromPhone(
                    language: auth.language,
                    weekStart: auth.weekStart,
                    defaultCurrency: auth.defaultCurrency,
                    timeFormat: auth.timeFormat,
                    prefsVersion: auth.prefsVersion
                )
            }
        }
    }
}

@Observable
@MainActor
final class WatchSessionManager: NSObject {
    static let shared = WatchSessionManager()

    var tokenDidArrive = false
    var logoutDidArrive = false

    private let session = WCSession.default

    private override init() {
        super.init()
    }

    func activate() {
        if WCSession.isSupported() {
            session.delegate = self
            session.activate()
        }
    }

    func notifyScoreUpdated(gameId: String, matchId: String, revision: Int? = nil) {
        guard session.activationState == .activated else { return }
        let payload = ScoreUpdatedPayload(
            gameId: gameId,
            matchId: matchId,
            revision: revision
        ).encode()
        session.transferUserInfo(payload)
    }
}

extension WatchSessionManager: WCSessionDelegate {
    nonisolated func session(_ session: WCSession,
                             didReceiveUserInfo userInfo: [String: Any]) {
        WatchConnectivityPayload.apply(userInfo)
    }

    nonisolated func session(_ session: WCSession,
                             didReceiveApplicationContext applicationContext: [String: Any]) {
        WatchConnectivityPayload.apply(applicationContext)
    }

    nonisolated func session(_ session: WCSession,
                             activationDidCompleteWith activationState: WCSessionActivationState,
                             error: (any Error)?) {
        guard activationState == .activated else { return }
        WatchConnectivityPayload.apply(session.receivedApplicationContext)
    }
}
