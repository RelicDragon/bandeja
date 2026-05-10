import Foundation
import Observation

struct WatchServeGuideSessionRecord: Codable, Equatable, Sendable {
    var firstServerTeam: TeamSide?
    var firstServerDoublesPlayerIndex: Int?
    var skipped: Bool
    var hiddenForMatch: Bool
    var classicPointsPlayedInGame: Int?
    var showedFirstServeCoachToast: Bool
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
        guard let data = ud?.data(forKey: Self.key(gameId: gameId, matchId: matchId)),
              let r = try? JSONDecoder().decode(WatchServeGuideSessionRecord.self, from: data) else {
            return nil
        }
        return r
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
        skipped: false,
        hiddenForMatch: false,
        classicPointsPlayedInGame: nil,
        showedFirstServeCoachToast: false
    )
}
