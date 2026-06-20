import Foundation
import Capacitor

extension Notification.Name {
    static let watchScoreUpdated = Notification.Name("bandeja.watchScoreUpdated")
}

@objc(LiveScoringBridgePlugin)
public class LiveScoringBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveScoringBridgePlugin"
    public let jsName = "LiveScoringBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "relayLiveScoringUpdate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "relayMatchTimerUpdate", returnType: CAPPluginReturnPromise),
    ]

    public override func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleWatchScoreUpdated(_:)),
            name: .watchScoreUpdated,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc func relayLiveScoringUpdate(_ call: CAPPluginCall) {
        guard let gameId = call.getString("gameId"), let matchId = call.getString("matchId") else {
            call.reject("Missing gameId or matchId")
            return
        }
        let liveScoring = call.getObject("liveScoring")
        WatchSessionManager.shared.relayLiveScoring(
            gameId: gameId,
            matchId: matchId,
            liveScoring: liveScoring
        )
        call.resolve()
    }

    @objc func relayMatchTimerUpdate(_ call: CAPPluginCall) {
        guard let gameId = call.getString("gameId"), let matchId = call.getString("matchId") else {
            call.reject("Missing gameId or matchId")
            return
        }
        guard let snapshot = call.getObject("snapshot") else {
            call.reject("Missing snapshot")
            return
        }
        WatchSessionManager.shared.relayMatchTimer(
            gameId: gameId,
            matchId: matchId,
            snapshot: snapshot
        )
        call.resolve()
    }

    @objc private func handleWatchScoreUpdated(_ note: Notification) {
        guard let payload = note.userInfo as? [String: Any] else { return }
        notifyListeners("watchScoreUpdated", data: payload)
    }
}
