import Foundation

private let watchLiveScoringVersion = 1

struct WatchMatchMetadata: Decodable, Sendable {
    let liveScoring: WatchLiveScoringEnvelope?
    let nonRallyOutcome: String?

    enum CodingKeys: String, CodingKey {
        case liveScoring
        case nonRallyOutcome
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        liveScoring = try? c.decodeIfPresent(WatchLiveScoringEnvelope.self, forKey: .liveScoring)
        nonRallyOutcome = try? c.decodeIfPresent(String.self, forKey: .nonRallyOutcome)
    }
}

struct WatchLiveScoringEnvelope: Codable, Sendable {
    let v: Int
    let revision: Int
    let updatedAt: String
    let writerUserId: String?
    let lastClientMessageId: String?
    let state: WatchLiveScoringState?

    var isSupported: Bool { v == watchLiveScoringVersion }
}

struct WatchLiveScoringState: Codable, Sendable {
    var activeSetIndex: Int
    var mode: WatchLiveScoringMode
    var sets: [WatchSetWrite]
    var classic: WatchLiveClassicState?
    var firstServerTeam: TeamSide?
    var firstServerDoublesPlayerIndex: Int?
    var pointsServeRotation: String?
    var matchStartCourtEndsSwapped: Bool?
    var matchStartTeamASidesMirrored: Bool?
    var matchStartTeamBSidesMirrored: Bool?
    var serveGuideSkipped: Bool?
    /// `REGULAR_SET` | `SUPER_TIEBREAK` — mirrors web live metadata optional Bo3 decider.
    var optionalDeciderFormat: String?
    var timedClassicSetLocked: Bool?
    var pointWinnerLog: [TeamSide]?
    var officiatingLetPending: Bool?
}

enum WatchLiveScoringMode: String, Codable, Sendable {
    case classic
    case points
}

struct WatchLiveClassicState: Codable, Sendable {
    var pointState: WatchLivePointState
    var withinSetTieBreak: Bool
    var tieBreakA: Int
    var tieBreakB: Int
    var deuceCount: Int
    var classicPointsPlayedInGame: Int

    init(
        pointState: WatchLivePointState,
        withinSetTieBreak: Bool,
        tieBreakA: Int,
        tieBreakB: Int,
        classicPointsPlayedInGame: Int,
        deuceCount: Int = 0
    ) {
        self.pointState = pointState
        self.withinSetTieBreak = withinSetTieBreak
        self.tieBreakA = tieBreakA
        self.tieBreakB = tieBreakB
        self.classicPointsPlayedInGame = classicPointsPlayedInGame
        self.deuceCount = deuceCount
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        pointState = try c.decode(WatchLivePointState.self, forKey: .pointState)
        withinSetTieBreak = try c.decode(Bool.self, forKey: .withinSetTieBreak)
        tieBreakA = try c.decode(Int.self, forKey: .tieBreakA)
        tieBreakB = try c.decode(Int.self, forKey: .tieBreakB)
        classicPointsPlayedInGame = try c.decode(Int.self, forKey: .classicPointsPlayedInGame)
        deuceCount = try c.decodeIfPresent(Int.self, forKey: .deuceCount) ?? 0
    }

    enum CodingKeys: String, CodingKey {
        case pointState, withinSetTieBreak, tieBreakA, tieBreakB, classicPointsPlayedInGame, deuceCount
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(pointState, forKey: .pointState)
        try c.encode(withinSetTieBreak, forKey: .withinSetTieBreak)
        try c.encode(tieBreakA, forKey: .tieBreakA)
        try c.encode(tieBreakB, forKey: .tieBreakB)
        try c.encode(classicPointsPlayedInGame, forKey: .classicPointsPlayedInGame)
        try c.encode(deuceCount, forKey: .deuceCount)
    }
}

enum WatchLivePointState: Codable, Sendable {
    case regular(teamA: PadelPoint, teamB: PadelPoint)
    case deuce
    case advantage(TeamSide)

    enum CodingKeys: String, CodingKey {
        case kind, teamA, teamB, side
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try c.decode(String.self, forKey: .kind)
        switch kind {
        case "deuce":
            self = .deuce
        case "advantage":
            self = .advantage(try c.decode(TeamSide.self, forKey: .side))
        default:
            let a = try c.decodeIfPresent(PadelPoint.self, forKey: .teamA) ?? .zero
            let b = try c.decodeIfPresent(PadelPoint.self, forKey: .teamB) ?? .zero
            self = .regular(teamA: a, teamB: b)
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .regular(let a, let b):
            try c.encode("regular", forKey: .kind)
            try c.encode(a, forKey: .teamA)
            try c.encode(b, forKey: .teamB)
        case .deuce:
            try c.encode("deuce", forKey: .kind)
        case .advantage(let side):
            try c.encode("advantage", forKey: .kind)
            try c.encode(side, forKey: .side)
        }
    }
}

extension WatchLivePointState {
    var padelPointState: PadelPointState {
        switch self {
        case .regular(let a, let b):
            return .regular(a: a, b: b)
        case .deuce:
            return .deuce
        case .advantage(let side):
            return .advantage(side)
        }
    }
}

struct WatchPatchLiveScoringBody: Codable, Sendable {
    let state: WatchLiveScoringState
    let baseRevision: Int?
    let clientMessageId: String
    let opId: String
}

struct WatchPatchLiveScoringResponse: Decodable, Sendable {
    let liveScoring: WatchLiveScoringEnvelope?
    let revision: Int
}
