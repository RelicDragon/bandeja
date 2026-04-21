import Foundation

@MainActor
enum WatchMatchTimerService {
    static func fetchSnapshot(gameId: String, matchId: String) async throws -> WatchMatchTimerSnapshot {
        let api = APIClient()
        let env: WatchMatchTimerEnvelope = try await api.fetch(.matchTimerGet(gameId: gameId, matchId: matchId))
        return env.snapshot
    }

    static func transition(gameId: String, matchId: String, action: String) async throws -> WatchMatchTimerSnapshot {
        let api = APIClient()
        let env: WatchMatchTimerEnvelope = try await api.postNoBody(
            .matchTimerAction(gameId: gameId, matchId: matchId, action: action)
        )
        return env.snapshot
    }
}
