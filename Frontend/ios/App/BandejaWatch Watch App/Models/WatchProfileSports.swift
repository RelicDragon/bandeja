import Foundation

struct WatchSportProfile: Decodable, Sendable {
    let sport: String
    let level: Double

    var resolvedSport: WatchSport { WatchSport.resolved(from: sport) }

    private enum CodingKeys: String, CodingKey {
        case sport, level
    }

    nonisolated init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        sport = try c.decode(String.self, forKey: .sport)
        if let d = try? c.decode(Double.self, forKey: .level) {
            level = d
        } else if let s = try? c.decode(String.self, forKey: .level), let d = Double(s) {
            level = d
        } else {
            level = 1.0
        }
    }
}

enum WatchProfileSports {
    static func userPrimarySport(_ user: WatchUser) -> WatchSport {
        WatchSport.resolved(from: user.primarySport)
    }

    static func findSportProfile(_ user: WatchUser, sport: WatchSport) -> WatchSportProfile? {
        user.sportProfiles?.first { $0.resolvedSport == sport }
    }

    static func isSportLevelAvailable(for user: WatchUser, sport: WatchSport) -> Bool {
        guard let enabled = user.sportsEnabled else { return true }
        return enabled.contains { WatchSport.resolved(from: $0) == sport }
    }

    static func formatLevelBadge(for user: WatchUser, sport: WatchSport) -> String {
        guard isSportLevelAvailable(for: user, sport: sport) else { return "-" }
        return String(format: "%.1f", displayLevel(for: user, sport: sport))
    }

    /// Mirrors FE `getDisplayLevelForSport`.
    static func displayLevel(for user: WatchUser, sport: WatchSport) -> Double {
        if let profile = findSportProfile(user, sport: sport) {
            return profile.level
        }
        if user.sportProfiles == nil {
            return user.level ?? 1.0
        }
        if sport == .padel || sport == userPrimarySport(user) {
            return user.level ?? 1.0
        }
        return 1.0
    }
}
