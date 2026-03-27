import Foundation

struct WatchResultsGame: Decodable, Sendable {
    let id: String
    let rounds: [WatchRound]
    let outcomes: [WatchOutcome]
}

struct WatchRound: Decodable, Identifiable, Sendable {
    let id: String
    let roundNumber: Int
    let matches: [WatchMatch]
}

struct WatchMatch: Decodable, Identifiable, Sendable {
    let id: String
    let matchNumber: Int
    let winnerId: String?
    let teams: [WatchTeam]
    let sets: [WatchSet]

    var sortedTeams: [WatchTeam] {
        teams.sorted { $0.teamNumber < $1.teamNumber }
    }
}

struct WatchTeam: Decodable, Identifiable, Sendable {
    let id: String
    let teamNumber: Int
    let players: [WatchTeamPlayer]
}

struct WatchTeamPlayer: Decodable, Sendable {
    let userId: String
    let user: WatchUser
}

struct WatchSet: Decodable, Identifiable, Sendable {
    let id: String
    let setNumber: Int
    let teamAScore: Int
    let teamBScore: Int
    let isTieBreak: Bool
}

struct WatchOutcome: Decodable, Sendable {
    let userId: String
    let user: WatchUser?
    let position: Int?
    let isWinner: Bool
    let wins: Int
    let ties: Int
    let losses: Int
    let pointsEarned: Int
}

struct WatchCreateIdBody: Encodable, Sendable {
    let id: String
}

struct WatchUpdateMatchBody: Encodable, Sendable {
    let teamA: [String]
    let teamB: [String]
    let sets: [WatchSetWrite]
}

struct WatchSetWrite: Encodable, Sendable {
    var teamA: Int
    var teamB: Int
    var isTieBreak: Bool = false
}
