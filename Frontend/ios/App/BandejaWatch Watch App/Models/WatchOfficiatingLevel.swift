import Foundation

/// Mirrors `Frontend/shared/officiatingLevel.ts`.
enum WatchOfficiatingLevel: String, Sendable {
    case none
    case hints
    case strict

    var showsHonorHints: Bool {
        self == .hints
    }
}

enum WatchOfficiatingResolver {
    static func parseGameLevel(metadata: [String: Any]?) -> WatchOfficiatingLevel? {
        guard let raw = metadata?["officiatingLevel"] as? String else { return nil }
        return WatchOfficiatingLevel(rawValue: raw)
    }

    static func defaultForTier(_ tier: String) -> WatchOfficiatingLevel {
        tier == "match" ? .hints : .none
    }

    static func inferTier(preset: String?) -> String {
        guard let preset else { return "both" }
        if preset.hasPrefix("POINTS_") || preset == "TIMED" || preset == "PAR_11" || preset == "SINGLE_GAME_21" {
            return "social"
        }
        if preset.hasPrefix("CLASSIC_") || preset.hasPrefix("BEST_OF_") { return "match" }
        return "both"
    }

    static func resolve(sport: WatchSport, preset: String?, gameMetadata: [String: Any]?) -> WatchOfficiatingLevel {
        if let game = parseGameLevel(metadata: gameMetadata) { return game }
        if sport == .pickleball { return .hints }
        return defaultForTier(inferTier(preset: preset?.uppercased()))
    }
}
