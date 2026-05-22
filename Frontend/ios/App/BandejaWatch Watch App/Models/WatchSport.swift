import Foundation

enum WatchSport: String, Sendable, Codable, CaseIterable {
    case padel = "PADEL"
    case tennis = "TENNIS"
    case pickleball = "PICKLEBALL"
    case badminton = "BADMINTON"
    case tableTennis = "TABLE_TENNIS"
    case squash = "SQUASH"

    var defaultPlayersPerMatch: Int {
        switch self {
        case .padel:
            return 4
        case .tennis, .pickleball, .badminton, .tableTennis, .squash:
            return 2
        }
    }

    static func resolved(from raw: String?) -> WatchSport {
        guard let raw, let s = WatchSport(rawValue: raw.uppercased()) else { return .padel }
        return s
    }
}

extension WatchGame {
    var resolvedSport: WatchSport { WatchSport.resolved(from: sport) }

    var resolvedPlayersPerMatch: Int {
        if playersPerMatch == 2 || playersPerMatch == 4 { return playersPerMatch! }
        return resolvedSport.defaultPlayersPerMatch
    }

    var isDoublesMatch: Bool { resolvedPlayersPerMatch == 4 }

    /// Classic set serve guide: padel uses `ballsInGames`; tennis uses sport (API may omit legacy flags).
    var serveGuideUsesClassicSetRules: Bool {
        if resolvedSport == .tennis { return !gameType.uppercased().contains("AMERICANO") }
        return ballsInGames == true
    }

    /// Rally sports: points-per-set UI + optional serve coach (table tennis, badminton).
    var usesRallySetScoring: Bool {
        switch resolvedSport {
        case .tableTennis, .badminton, .pickleball, .squash:
            return true
        default:
            return false
        }
    }
}
