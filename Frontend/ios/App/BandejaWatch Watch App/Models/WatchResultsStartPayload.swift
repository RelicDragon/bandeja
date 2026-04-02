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
}

enum WatchResultsRoundBuilder {
    static func canBuildFirstRound(for game: WatchGame) -> Bool {
        (try? firstRound(for: game)) != nil
    }

    static func firstRound(for game: WatchGame) throws -> WatchSyncRoundBody {
        guard game.participantsReady else {
            throw WatchResultsStartError.notReady
        }
        if game.hasFixedTeams == true {
            guard game.teamsReady else { throw WatchResultsStartError.notReady }
        }
        let playing = game.participants.filter(\.isPlaying)
        guard playing.count == 4 else {
            throw WatchResultsStartError.invalidPlayerCount
        }
        let ids = playing.map(\.userId)
        let sets = initialSets(for: game)
        let roundId = UUID().uuidString

        if game.hasFixedTeams == true, let teams = game.fixedTeams {
            let t1 = teams.first { $0.teamNumber == 1 }
            let t2 = teams.first { $0.teamNumber == 2 }
            let a = t1?.players.map(\.userId) ?? []
            let b = t2?.players.map(\.userId) ?? []
            if !a.isEmpty, !b.isEmpty {
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
        if !mgt.isEmpty && mgt != "HANDMADE" {
            throw WatchResultsStartError.unsupportedMatchGeneration
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

    private static func initialSets(for game: WatchGame) -> [WatchSyncSetBody] {
        let n = game.fixedNumberOfSets ?? 0
        if n > 0 {
            return (0..<n).map { _ in WatchSyncSetBody(teamA: 0, teamB: 0, isTieBreak: false) }
        }
        return [WatchSyncSetBody(teamA: 0, teamB: 0, isTieBreak: false)]
    }
}

enum WatchResultsStartError: Error {
    case notReady
    case invalidPlayerCount
    case unsupportedMatchGeneration
}
