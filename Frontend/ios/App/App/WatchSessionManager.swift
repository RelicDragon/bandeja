import WatchConnectivity

final class WatchSessionManager: NSObject {
    static let shared = WatchSessionManager()

    private let session = WCSession.default

    private override init() {
        super.init()
        if WCSession.isSupported() {
            session.delegate = self
            session.activate()
        }
    }

    func sendToken(_ token: String) {
        guard session.activationState == .activated, session.isWatchAppInstalled else { return }
        session.transferUserInfo(["token": token])
    }

    func sendLogout() {
        guard session.activationState == .activated, session.isWatchAppInstalled else { return }
        session.transferUserInfo(["event": "logout"])
    }
}

extension WatchSessionManager: WCSessionDelegate {
    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    func session(_ session: WCSession,
                 activationDidCompleteWith activationState: WCActivationState,
                 error: Error?) {}
}
