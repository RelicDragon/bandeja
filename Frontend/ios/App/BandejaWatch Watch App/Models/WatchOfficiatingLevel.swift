import Foundation

/// Mirrors `Frontend/shared/officiatingLevel.ts`.
enum WatchOfficiatingLevel: String, Sendable {
    case none
    case hints
    case strict

    var showsHonorHints: Bool {
        self == .hints
    }

    var isStrict: Bool {
        self == .strict
    }
}

enum WatchOfficiatingResolver {
    static func parseGameLevel(metadata: [String: Any]?) -> WatchOfficiatingLevel? {
        guard let raw = metadata?["officiatingLevel"] as? String else { return nil }
        return WatchOfficiatingLevel(rawValue: raw)
    }

    static func defaultForTier(_ tier: String) -> WatchOfficiatingLevel {
        tier == "match" ? .strict : .none
    }

    private static let presetStrictOfficiating: Set<String> = [
        "CLASSIC_BEST_OF_3",
        "CLASSIC_BEST_OF_5",
        "BEST_OF_3_11",
        "BEST_OF_3_21",
    ]

    static func presetMetaOfficiating(preset: String?) -> WatchOfficiatingLevel? {
        guard let preset else { return nil }
        return presetStrictOfficiating.contains(preset.uppercased()) ? .strict : nil
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
        if let meta = presetMetaOfficiating(preset: preset) { return meta }
        let tier = inferTier(preset: preset?.uppercased())
        if sport == .pickleball, tier == "social" { return .hints }
        return defaultForTier(tier)
    }
}
