import Foundation

/// Mirror of `Frontend/shared/matchFormat.ts` — keep parity tests in sync.
enum WatchMatchFormat {
    nonisolated static func playersPerMatch(of game: WatchGame) -> Int {
        if let ppm = game.playersPerMatch, ppm == 2 || ppm == 4 { return ppm }
        return game.resolvedSport.defaultPlayersPerMatch
    }

    nonisolated static func playersPerTeam(of game: WatchGame) -> Int {
        playersPerMatch(of: game) / 2
    }

    nonisolated static func maxPlayersPerTeam(for game: WatchGame?, participantCount: Int? = nil) -> Int {
        if let ppm = game?.playersPerMatch, ppm == 2 || ppm == 4 { return ppm / 2 }
        if participantCount == 2 { return 1 }
        if let game { return playersPerTeam(of: game) }
        return WatchSport.padel.defaultPlayersPerMatch / 2
    }

    nonisolated static func isPresetResultsRoster(playingCount: Int) -> Bool {
        playingCount == 2 || playingCount == 4
    }

    nonisolated static func capUsers<T>(_ users: [T], max: Int) -> [T] {
        Array(users.prefix(max))
    }

    nonisolated static func capUserIds(_ ids: [String], max: Int) -> [String] {
        Array(ids.prefix(max))
    }
}
