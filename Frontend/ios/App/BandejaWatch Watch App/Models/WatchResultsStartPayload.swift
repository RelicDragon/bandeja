import Foundation

struct WatchGameResultsStatusPatch: Encodable, Sendable {
    let resultsStatus: String
}

struct WatchSyncResultsBody: Encodable, Sendable {
    let rounds: [WatchSyncRoundBody]
}

struct WatchSyncRoundBody: Encodable, Sendable {
    let id: String
    let matches: [WatchSyncMatchBody]
}

struct WatchSyncMatchBody: Encodable, Sendable {
    let id: String
    let teamA: [String]
    let teamB: [String]
    let sets: [WatchSyncSetBody]
    let courtId: String?
}

struct WatchSyncSetBody: Encodable, Sendable {
    let teamA: Int
    let teamB: Int
    let isTieBreak: Bool
    let role: WatchMatchSetRole

    nonisolated init(teamA: Int, teamB: Int, isTieBreak: Bool, role: WatchMatchSetRole = .official) {
        self.teamA = teamA
        self.teamB = teamB
        self.isTieBreak = isTieBreak
        self.role = role
    }
}

enum WatchResultsRoundBuilder {
    nonisolated static func canBuildFirstRound(for game: WatchGame) -> Bool {
        (try? firstRound(for: game)) != nil
    }

    nonisolated static func firstRound(for game: WatchGame) throws -> WatchSyncRoundBody {
        guard game.participantsReady else {
            throw WatchResultsStartError.notReady
        }
        if game.hasFixedTeams == true {
            guard game.teamsReady else { throw WatchResultsStartError.notReady }
        }
        let playing = game.participants.filter(\.isPlaying)
        let playingCount = playing.count
        guard WatchMatchFormat.isPresetResultsRoster(playingCount: playingCount) else {
            throw WatchResultsStartError.invalidPlayerCount
        }
        let ppm = WatchMatchFormat.playersPerMatch(of: game)
        let ppt = WatchMatchFormat.playersPerTeam(of: game)
        if playingCount == 4 && ppm == 2 {
            throw WatchResultsStartError.unsupportedMatchGeneration
        }
        let ids = playing.map(\.userId)
        let sets = initialSets(for: game)
        let roundId = UUID().uuidString

        if game.hasFixedTeams == true, let teams = game.fixedTeams {
            let t1 = teams.first { $0.teamNumber == 1 }
            let t2 = teams.first { $0.teamNumber == 2 }
            let a = WatchMatchFormat.capUserIds(t1?.players.map(\.userId) ?? [], max: ppt)
            let b = WatchMatchFormat.capUserIds(t2?.players.map(\.userId) ?? [], max: ppt)
            if a.count == ppt, b.count == ppt {
                let match = WatchSyncMatchBody(
                    id: UUID().uuidString,
                    teamA: a,
                    teamB: b,
                    sets: sets,
                    courtId: nil
                )
                return WatchSyncRoundBody(id: roundId, matches: [match])
            }
        }

        let mgt = game.matchGenerationType?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if mgt == "HANDMADE" {
            let match = WatchSyncMatchBody(
                id: UUID().uuidString,
                teamA: [],
                teamB: [],
                sets: sets,
                courtId: nil
            )
            return WatchSyncRoundBody(id: roundId, matches: [match])
        }
        if !mgt.isEmpty && mgt != "AUTOMATIC" {
            throw WatchResultsStartError.unsupportedMatchGeneration
        }

        if playingCount == 2 && ppm == 2 {
            let match = WatchSyncMatchBody(
                id: UUID().uuidString,
                teamA: [ids[0]],
                teamB: [ids[1]],
                sets: sets,
                courtId: nil
            )
            return WatchSyncRoundBody(id: roundId, matches: [match])
        }

        guard playingCount == 4 && ppm == 4 else {
            throw WatchResultsStartError.invalidPlayerCount
        }

        let triples: [(Int, Int, Int, Int)] = [(0, 1, 2, 3), (0, 2, 1, 3), (0, 3, 1, 2)]
        let matches = triples.map { i, j, k, l in
            WatchSyncMatchBody(
                id: UUID().uuidString,
                teamA: [ids[i], ids[j]],
                teamB: [ids[k], ids[l]],
                sets: sets,
                courtId: nil
            )
        }
        return WatchSyncRoundBody(id: roundId, matches: matches)
    }

    nonisolated private static func initialSets(for game: WatchGame) -> [WatchSyncSetBody] {
        let n = game.fixedNumberOfSets ?? 0
        if n <= 0 {
            return [WatchSyncSetBody(teamA: 0, teamB: 0, isTieBreak: false)]
        }
        let wom = game.winnerOfMatch?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let classicBySets = game.ballsInGames == true && wom == "BY_SETS"
        let rowCount = classicBySets ? (n / 2 + 1) : n
        return (0..<rowCount).map { _ in WatchSyncSetBody(teamA: 0, teamB: 0, isTieBreak: false, role: .official) }
    }
}

enum WatchResultsStartError: Error, Equatable {
    case notReady
    case invalidPlayerCount
    case unsupportedMatchGeneration
}
