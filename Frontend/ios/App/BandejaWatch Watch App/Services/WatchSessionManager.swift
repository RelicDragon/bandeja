import WatchConnectivity
import Observation

@Observable
@MainActor
final class WatchSessionManager: NSObject {
    static let shared = WatchSessionManager()

    /// Toggled on the main actor whenever a new token arrives via WCSession.
    var tokenDidArrive = false
    /// Toggled on the main actor whenever a logout event arrives via WCSession.
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
        if let token = userInfo["token"] as? String {
            KeychainHelper.shared.write(token: token)
            Task { @MainActor in
                WatchSessionManager.shared.tokenDidArrive.toggle()
            }
        } else if userInfo["event"] as? String == "logout" {
            KeychainHelper.shared.deleteToken()
            Task { @MainActor in
                WatchSessionManager.shared.logoutDidArrive.toggle()
            }
        }
    }

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}

    nonisolated func sessionDidDeactivate(_ session: WCSession) {}

    nonisolated func session(_ session: WCSession,
                             activationDidCompleteWith activationState: WCActivationState,
                             error: Error?) {}
}
