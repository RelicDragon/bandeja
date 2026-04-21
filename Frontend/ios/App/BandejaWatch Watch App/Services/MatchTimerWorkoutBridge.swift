import Foundation

@MainActor
enum MatchTimerWorkoutBridge {
    static func notifyWorkoutPaused() async {
        guard case .matchActive(let gid, let mid) = ActiveSessionManager.shared.phase else { return }
        do {
            _ = try await WatchMatchTimerService.transition(gameId: gid, matchId: mid, action: "pause")
        } catch {}
    }

    static func notifyWorkoutResumed() async {
        guard case .matchActive(let gid, let mid) = ActiveSessionManager.shared.phase else { return }
        do {
            _ = try await WatchMatchTimerService.transition(gameId: gid, matchId: mid, action: "resume")
        } catch {}
    }
}
