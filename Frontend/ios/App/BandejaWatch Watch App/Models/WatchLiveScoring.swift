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
    var classicPointsPlayedInGame: Int
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

struct WatchPatchLiveScoringBody: Encodable, Sendable {
    let state: WatchLiveScoringState
    let baseRevision: Int?
    let clientMessageId: String
    let opId: String
}

struct WatchPatchLiveScoringResponse: Decodable, Sendable {
    let liveScoring: WatchLiveScoringEnvelope?
    let revision: Int
}
