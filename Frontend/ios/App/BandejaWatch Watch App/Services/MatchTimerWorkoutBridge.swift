import Foundation
import os

/// Mirrors HealthKit pause/resume onto the server match timer.
///
/// Skips the request when the relay store already shows the target status for the active
/// match: that is the case when the timer bar itself triggered the workout pause/resume, so
/// the server would otherwise receive the same transition twice.
@MainActor
enum MatchTimerWorkoutBridge {
    private static let log = Logger(subsystem: Bundle.main.bundleIdentifier ?? "BandejaWatch", category: "MatchTimerBridge")

    static func notifyWorkoutPaused() async {
        await transitionActiveMatch(action: "pause", targetStatus: "PAUSED")
    }

    static func notifyWorkoutResumed() async {
        await transitionActiveMatch(action: "resume", targetStatus: "RUNNING")
    }

    private static func transitionActiveMatch(action: String, targetStatus: String) async {
        guard case .matchActive(let gid, let mid) = ActiveSessionManager.shared.phase else { return }
        let store = WatchMatchTimerRelayStore.shared
        if store.lastStatus(gameId: gid, matchId: mid) == targetStatus { return }
        do {
            let snapshot = try await WatchMatchTimerService.transition(gameId: gid, matchId: mid, action: action)
            store.ingest(gameId: gid, matchId: mid, snapshot: snapshot)
        } catch {
            log.error("Timer \(action, privacy: .public) via workout bridge failed: \(error.localizedDescription, privacy: .public)")
        }
    }
}
