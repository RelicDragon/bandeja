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

/// Mirrors `getOfficiatingLevelForGame` (`Backend/src/shared/createTemplates.ts`) +
/// `resolveOfficiatingLevel` (`officiatingLevel.ts`).
enum WatchOfficiatingResolver {
    /// `social` | `match` | `both` (`PresetTier`).
    enum PresetTier: String, Sendable {
        case social
        case match
        case both
    }

    private struct PresetMeta: Sendable {
        var tier: PresetTier
        var officiatingLevel: WatchOfficiatingLevel?
    }

    /// `parseGameOfficiatingLevel(metadata)` — unknown strings → nil.
    static func parseGameLevel(_ raw: String?) -> WatchOfficiatingLevel? {
        guard let raw else { return nil }
        return WatchOfficiatingLevel(rawValue: raw)
    }

    /// `defaultOfficiatingForTier`.
    static func defaultForTier(_ tier: PresetTier) -> WatchOfficiatingLevel {
        tier == .match ? .strict : .none
    }

    /// `getOfficiatingLevelForGame` flattens `[PADEL, TENNIS, PICKLEBALL, BADMINTON, TABLE_TENNIS, SQUASH]`
    /// preset meta and takes the first row matching the preset (sport-independent). This table is that
    /// first-match view — keep it in sync with `*_PRESET_META` in `createTemplates.ts`.
    private static let presetMeta: [String: PresetMeta] = [
        // PADEL_PRESET_META
        "CLASSIC_AUTOMATIC": PresetMeta(tier: .match, officiatingLevel: nil),
        "POINTS_24": PresetMeta(tier: .social, officiatingLevel: nil),
        "POINTS_21": PresetMeta(tier: .social, officiatingLevel: nil),
        "POINTS_16": PresetMeta(tier: .social, officiatingLevel: nil),
        "POINTS_32": PresetMeta(tier: .social, officiatingLevel: nil),
        "CLASSIC_BEST_OF_3": PresetMeta(tier: .match, officiatingLevel: nil),
        "CLASSIC_BEST_OF_5": PresetMeta(tier: .match, officiatingLevel: nil),
        "TIMED": PresetMeta(tier: .both, officiatingLevel: nil),
        "CUSTOM": PresetMeta(tier: .both, officiatingLevel: nil),
        // TENNIS_PRESET_META (first occurrence only)
        "CLASSIC_FAST4": PresetMeta(tier: .social, officiatingLevel: nil),
        "CLASSIC_SINGLE_SET": PresetMeta(tier: .social, officiatingLevel: nil),
        "CLASSIC_TIMED": PresetMeta(tier: .social, officiatingLevel: nil),
        // PICKLEBALL_PRESET_META
        "BEST_OF_3_11": PresetMeta(tier: .match, officiatingLevel: .strict),
        // BADMINTON_PRESET_META
        "BEST_OF_3_21": PresetMeta(tier: .match, officiatingLevel: .strict),
        "BEST_OF_3_15": PresetMeta(tier: .both, officiatingLevel: nil),
        "POINTS_15": PresetMeta(tier: .social, officiatingLevel: nil),
        // TABLE_TENNIS_PRESET_META
        "BEST_OF_5_11": PresetMeta(tier: .match, officiatingLevel: nil),
        "POINTS_11": PresetMeta(tier: .social, officiatingLevel: nil),
        "SINGLE_GAME_21": PresetMeta(tier: .social, officiatingLevel: nil),
    ]

    /// `SportPresetMeta.officiatingLevel` for the first flattened row (nil when unset / unknown preset).
    static func presetMetaOfficiating(preset: String?) -> WatchOfficiatingLevel? {
        guard let preset else { return nil }
        return presetMeta[preset.uppercased()]?.officiatingLevel
    }

    /// `inferPresetTier` — fallback for presets absent from every `*_PRESET_META` list.
    static func inferTier(preset: String?) -> PresetTier {
        guard let preset else { return .both }
        if preset.hasPrefix("POINTS_") || preset == "TIMED" || preset == "PAR_11" { return .social }
        if preset.hasPrefix("CLASSIC_") || preset.hasPrefix("BEST_OF_") { return .match }
        return .both
    }

    /// `row?.tier ?? inferPresetTier(preset)`.
    static func presetTier(preset: String?) -> PresetTier {
        guard let preset else { return .both }
        return presetMeta[preset.uppercased()]?.tier ?? inferTier(preset: preset.uppercased())
    }

    /// `getOfficiatingLevelForGame(sport, preset, metadata)`.
    static func resolve(sport: WatchSport, preset: String?, gameOfficiatingLevel: String?) -> WatchOfficiatingLevel {
        guard let preset, !preset.isEmpty else { return .none }
        if let game = parseGameLevel(gameOfficiatingLevel) { return game }
        if let meta = presetMetaOfficiating(preset: preset) { return meta }
        let tier = presetTier(preset: preset.uppercased())
        if sport == .pickleball, tier == .social { return .hints }
        return defaultForTier(tier)
    }
}
