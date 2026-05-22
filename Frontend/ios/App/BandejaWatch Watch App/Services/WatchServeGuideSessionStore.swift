import Foundation
import Observation

struct WatchServeGuideSessionRecord: Codable, Equatable, Sendable {
    var firstServerTeam: TeamSide?
    var firstServerDoublesPlayerIndex: Int?
    /// `official` | `simple` — Americano / super tie-break serve rotation.
    var pointsServeRotation: String?
    /// Team A on diagram top when true (default: Team A bottom).
    var matchStartCourtEndsSwapped: Bool?
  var matchStartTeamASidesMirrored: Bool?
  var matchStartTeamBSidesMirrored: Bool?
    var skipped: Bool
    var classicPointsPlayedInGame: Int?
    var showedFirstServeCoachToast: Bool

    private enum CodingKeys: String, CodingKey {
        case firstServerTeam
        case firstServerDoublesPlayerIndex
        case pointsServeRotation
        case matchStartCourtEndsSwapped
        case matchStartTeamASidesMirrored
        case matchStartTeamBSidesMirrored
        case skipped
        case hiddenForMatch
        case classicPointsPlayedInGame
        case showedFirstServeCoachToast
    }

    init(
        firstServerTeam: TeamSide?,
        firstServerDoublesPlayerIndex: Int?,
        pointsServeRotation: String?,
        matchStartCourtEndsSwapped: Bool?,
        matchStartTeamASidesMirrored: Bool?,
        matchStartTeamBSidesMirrored: Bool?,
        skipped: Bool,
        classicPointsPlayedInGame: Int?,
        showedFirstServeCoachToast: Bool
    ) {
        self.firstServerTeam = firstServerTeam
        self.firstServerDoublesPlayerIndex = firstServerDoublesPlayerIndex
        self.pointsServeRotation = pointsServeRotation
        self.matchStartCourtEndsSwapped = matchStartCourtEndsSwapped
        self.matchStartTeamASidesMirrored = matchStartTeamASidesMirrored
        self.matchStartTeamBSidesMirrored = matchStartTeamBSidesMirrored
        self.skipped = skipped
        self.classicPointsPlayedInGame = classicPointsPlayedInGame
        self.showedFirstServeCoachToast = showedFirstServeCoachToast
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        firstServerTeam = try c.decodeIfPresent(TeamSide.self, forKey: .firstServerTeam)
        firstServerDoublesPlayerIndex = try c.decodeIfPresent(Int.self, forKey: .firstServerDoublesPlayerIndex)
        pointsServeRotation = try c.decodeIfPresent(String.self, forKey: .pointsServeRotation)
        matchStartCourtEndsSwapped = try c.decodeIfPresent(Bool.self, forKey: .matchStartCourtEndsSwapped)
        matchStartTeamASidesMirrored = try c.decodeIfPresent(Bool.self, forKey: .matchStartTeamASidesMirrored)
        matchStartTeamBSidesMirrored = try c.decodeIfPresent(Bool.self, forKey: .matchStartTeamBSidesMirrored)
        let hidden = try c.decodeIfPresent(Bool.self, forKey: .hiddenForMatch) ?? false
        let decodedSkipped = try c.decodeIfPresent(Bool.self, forKey: .skipped) ?? false
        skipped = decodedSkipped || hidden
        classicPointsPlayedInGame = try c.decodeIfPresent(Int.self, forKey: .classicPointsPlayedInGame)
        showedFirstServeCoachToast = try c.decodeIfPresent(Bool.self, forKey: .showedFirstServeCoachToast) ?? false
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(firstServerTeam, forKey: .firstServerTeam)
        try c.encodeIfPresent(firstServerDoublesPlayerIndex, forKey: .firstServerDoublesPlayerIndex)
        try c.encodeIfPresent(pointsServeRotation, forKey: .pointsServeRotation)
        try c.encodeIfPresent(matchStartCourtEndsSwapped, forKey: .matchStartCourtEndsSwapped)
        try c.encodeIfPresent(matchStartTeamASidesMirrored, forKey: .matchStartTeamASidesMirrored)
        try c.encodeIfPresent(matchStartTeamBSidesMirrored, forKey: .matchStartTeamBSidesMirrored)
        try c.encode(skipped, forKey: .skipped)
        try c.encodeIfPresent(classicPointsPlayedInGame, forKey: .classicPointsPlayedInGame)
        try c.encode(showedFirstServeCoachToast, forKey: .showedFirstServeCoachToast)
    }
}

@Observable
@MainActor
final class WatchServeGuideSessionStore {
    static let shared = WatchServeGuideSessionStore()

    private let ud = UserDefaults(suiteName: KeychainHelper.accessGroup)
    private static func key(gameId: String, matchId: String) -> String {
        "bandeja.watch.serveGuide.\(gameId).\(matchId)"
    }

    func load(gameId: String, matchId: String) -> WatchServeGuideSessionRecord? {
        guard let data = ud?.data(forKey: Self.key(gameId: gameId, matchId: matchId)) else { return nil }
        if let r = try? JSONDecoder().decode(WatchServeGuideSessionRecord.self, from: data) {
            if let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               raw["hiddenForMatch"] as? Bool == true {
                var migrated = r
                migrated.skipped = true
                save(gameId: gameId, matchId: matchId, record: migrated)
                return migrated
            }
            return r
        }
        return nil
    }

    func save(gameId: String, matchId: String, record: WatchServeGuideSessionRecord) {
        if let data = try? JSONEncoder().encode(record) {
            ud?.set(data, forKey: Self.key(gameId: gameId, matchId: matchId))
        }
    }

    func clear(gameId: String, matchId: String) {
        ud?.removeObject(forKey: Self.key(gameId: gameId, matchId: matchId))
    }
}

extension WatchServeGuideSessionRecord {
    static let empty = WatchServeGuideSessionRecord(
        firstServerTeam: nil,
        firstServerDoublesPlayerIndex: nil,
        pointsServeRotation: nil,
        matchStartCourtEndsSwapped: nil,
        matchStartTeamASidesMirrored: nil,
        matchStartTeamBSidesMirrored: nil,
        skipped: false,
        classicPointsPlayedInGame: nil,
        showedFirstServeCoachToast: false
    )
}
