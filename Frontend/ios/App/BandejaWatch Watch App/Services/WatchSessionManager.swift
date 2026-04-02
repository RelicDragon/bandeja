import WatchConnectivity
import Observation

private enum WatchConnectivityPayload {
    nonisolated static func apply(_ dict: [String: Any]) {
        let token = dict["token"] as? String
        let isLogout = dict["event"] as? String == "logout"
        let language = dict["language"] as? String
        let weekStart = dict["weekStart"] as? String
        let defaultCurrency = dict["defaultCurrency"] as? String
        let timeFormat = dict["timeFormat"] as? String
        let prefsVersion = dict["prefsVersion"] as? Double
            ?? (dict["prefsVersion"] as? Int).map { Double($0) }
        let hasPrefs = language != nil || weekStart != nil || defaultCurrency != nil
            || timeFormat != nil || prefsVersion != nil

        Task { @MainActor in
            if isLogout {
                KeychainHelper.shared.deleteToken()
                WatchPreferencesStore.shared.clear()
                ScoringOutbox.shared.clear()
                WatchSessionManager.shared.logoutDidArrive.toggle()
                return
            }
            if let token, !token.isEmpty {
                KeychainHelper.shared.write(token: token)
                if hasPrefs {
                    WatchPreferencesStore.shared.applyFromPhone(
                        language: language,
                        weekStart: weekStart,
                        defaultCurrency: defaultCurrency,
                        timeFormat: timeFormat,
                        prefsVersion: prefsVersion
                    )
                }
                WatchSessionManager.shared.tokenDidArrive.toggle()
            } else if hasPrefs {
                WatchPreferencesStore.shared.applyFromPhone(
                    language: language,
                    weekStart: weekStart,
                    defaultCurrency: defaultCurrency,
                    timeFormat: timeFormat,
                    prefsVersion: prefsVersion
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

    func notifyScoreUpdated(gameId: String) {
        guard session.activationState == .activated else { return }
        session.transferUserInfo(["event": "scoreUpdated", "gameId": gameId])
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
