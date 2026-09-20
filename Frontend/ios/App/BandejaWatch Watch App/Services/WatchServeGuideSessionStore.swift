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

/// Persisted envelope: the record plus when it was written, so stale per-match keys can be pruned.
private struct WatchServeGuideSessionEnvelope: Codable {
    let savedAt: Date
    let record: WatchServeGuideSessionRecord
}

/// Offline cache for serve-seed UI flags only. Hot path reads/writes go through `MatchScoringViewModel`.
///
/// One key per game/match; entries older than `maxAge` (14 days) are pruned on every write so the
/// App Group suite does not accumulate a key for every match ever scored.
@Observable
@MainActor
final class WatchServeGuideSessionStore {
    static let shared = WatchServeGuideSessionStore()

    static let maxAge: TimeInterval = 14 * 24 * 3600
    private static let keyPrefix = "bandeja.watch.serveGuide."

    private let ud: UserDefaults?
    private let now: () -> Date

    private init() {
        self.ud = UserDefaults(suiteName: KeychainHelper.accessGroup)
        self.now = { Date() }
    }

    /// Test seam: isolated suite + controllable clock.
    init(suite: UserDefaults?, now: @escaping () -> Date = { Date() }) {
        self.ud = suite
        self.now = now
    }

    private static func key(gameId: String, matchId: String) -> String {
        "\(keyPrefix)\(gameId).\(matchId)"
    }

    func load(gameId: String, matchId: String) -> WatchServeGuideSessionRecord? {
        guard let data = ud?.data(forKey: Self.key(gameId: gameId, matchId: matchId)) else { return nil }
        guard let r = Self.decodeRecord(data) else { return nil }
        if let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           Self.legacyHiddenFlag(raw) {
            var migrated = r
            migrated.skipped = true
            save(gameId: gameId, matchId: matchId, record: migrated)
            return migrated
        }
        return r
    }

    func save(gameId: String, matchId: String, record: WatchServeGuideSessionRecord) {
        let envelope = WatchServeGuideSessionEnvelope(savedAt: now(), record: record)
        if let data = try? JSONEncoder().encode(envelope) {
            ud?.set(data, forKey: Self.key(gameId: gameId, matchId: matchId))
        }
        pruneExpired()
    }

    func clear(gameId: String, matchId: String) {
        ud?.removeObject(forKey: Self.key(gameId: gameId, matchId: matchId))
    }

    /// Number of serve-guide keys currently stored (test/diagnostic helper).
    var storedEntryCount: Int {
        ud?.dictionaryRepresentation().keys.filter { $0.hasPrefix(Self.keyPrefix) }.count ?? 0
    }

    /// Drops entries older than `maxAge`. Legacy entries without a timestamp are re-wrapped
    /// with the current time so they age out on the normal schedule.
    func pruneExpired() {
        guard let ud else { return }
        let cutoff = now().addingTimeInterval(-Self.maxAge)
        for key in ud.dictionaryRepresentation().keys where key.hasPrefix(Self.keyPrefix) {
            guard let data = ud.data(forKey: key) else { continue }
            if let envelope = try? JSONDecoder().decode(WatchServeGuideSessionEnvelope.self, from: data) {
                if envelope.savedAt < cutoff {
                    ud.removeObject(forKey: key)
                }
                continue
            }
            guard let legacy = try? JSONDecoder().decode(WatchServeGuideSessionRecord.self, from: data) else {
                ud.removeObject(forKey: key)
                continue
            }
            let wrapped = WatchServeGuideSessionEnvelope(savedAt: now(), record: legacy)
            if let rewrapped = try? JSONEncoder().encode(wrapped) {
                ud.set(rewrapped, forKey: key)
            }
        }
    }

    private static func decodeRecord(_ data: Data) -> WatchServeGuideSessionRecord? {
        if let envelope = try? JSONDecoder().decode(WatchServeGuideSessionEnvelope.self, from: data) {
            return envelope.record
        }
        return try? JSONDecoder().decode(WatchServeGuideSessionRecord.self, from: data)
    }

    /// `hiddenForMatch` predates `skipped`; it may sit at the top level (legacy) or under `record`.
    private static func legacyHiddenFlag(_ raw: [String: Any]) -> Bool {
        if raw["hiddenForMatch"] as? Bool == true { return true }
        if let record = raw["record"] as? [String: Any], record["hiddenForMatch"] as? Bool == true { return true }
        return false
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
