import Foundation

struct WatchResultsGame: Decodable, Sendable {
    let id: String
    let rounds: [WatchRound]
    let outcomes: [WatchOutcome]
}

struct WatchStartResultsEntryApiData: Decodable, Sendable {
    let game: WatchGame
    let round: WatchRound?
    let alreadyHadRounds: Bool?
}

struct WatchGenerateRoundApiData: Decodable, Sendable {
    let round: WatchRound
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
    let timerStatus: String?
    let timerStartedAt: String?
    let timerPausedAt: String?
    let timerElapsedMs: Int?
    let timerCapMinutes: Int?

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
    let role: WatchMatchSetRole?
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

struct WatchSetWrite: Codable, Sendable, Equatable {
    var teamA: Int
    var teamB: Int
    var isTieBreak: Bool
    var role: WatchMatchSetRole?

    enum CodingKeys: String, CodingKey {
        case teamA, teamB, isTieBreak, role
    }

    init(teamA: Int, teamB: Int, isTieBreak: Bool = false, role: WatchMatchSetRole? = .official) {
        self.teamA = teamA
        self.teamB = teamB
        self.isTieBreak = isTieBreak
        self.role = role
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        teamA = try c.decode(Int.self, forKey: .teamA)
        teamB = try c.decode(Int.self, forKey: .teamB)
        isTieBreak = try c.decodeIfPresent(Bool.self, forKey: .isTieBreak) ?? false
        role = try c.decodeIfPresent(WatchMatchSetRole.self, forKey: .role)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(teamA, forKey: .teamA)
        try c.encode(teamB, forKey: .teamB)
        try c.encode(isTieBreak, forKey: .isTieBreak)
        try c.encode(role ?? .official, forKey: .role)
    }
}

extension WatchSet {
    var resolvedRole: WatchMatchSetRole { role ?? .official }
}

extension WatchSetWrite {
    var resolvedRole: WatchMatchSetRole { role ?? .official }
}
