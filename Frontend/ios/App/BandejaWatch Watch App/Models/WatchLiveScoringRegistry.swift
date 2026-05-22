import Foundation

/// Mirrors `LiveScoringUiId` in `Frontend/src/liveScoring/registry.ts` (Watch subset).
enum WatchLiveScoringUiId: Sendable, Equatable {
    case classicCourt
    case americanoPoints
    case rallyPointsBoard
    case tableTennisBoard
}

enum WatchLiveScoringRegistry {
    private static let tennisClassicPresets: Set<WatchScoringPreset> = [
        .classicBo3,
        .classicBo5,
        .classicSuperTb,
        .classicProSet,
        .classicSingleSet,
        .classicShortSet,
        .classicTimed,
        .timed,
        .custom,
    ]

    /// `sport + preset → UI` (padel/tennis classic unchanged; table tennis gets rally board).
    static func resolve(game: WatchGame?, rules: WatchScoringRules) -> WatchLiveScoringUiId {
        let sport = game?.resolvedSport ?? .padel
        let preset = game?.scoringPreset.flatMap { WatchScoringPreset(rawValue: $0.uppercased()) }

        if sport == .tennis {
            if let preset, tennisClassicPresets.contains(preset), rules.isClassic {
                return .classicCourt
            }
            if rules.isClassic { return .classicCourt }
        }

        if sport == .tableTennis, game?.usesRallySetScoring == true, !rules.isClassic {
            return .tableTennisBoard
        }

        if rules.isPoints { return .americanoPoints }
        switch sport {
        case .badminton, .pickleball, .squash
            where game?.usesRallySetScoring == true && !rules.isClassic:
            return .rallyPointsBoard
        default:
            break
        }
        if game?.usesRallySetScoring == true, !rules.isClassic { return .americanoPoints }
        return .classicCourt
    }
}

extension WatchGame {
    var liveScoringUiId: WatchLiveScoringUiId {
        WatchLiveScoringRegistry.resolve(game: self, rules: WatchScoringRulebook.rules(for: self))
    }
}
