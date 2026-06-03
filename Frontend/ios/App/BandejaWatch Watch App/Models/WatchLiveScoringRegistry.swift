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
        .classicFast4,
        .classicTimed,
        .timed,
        .custom,
    ]

    /// Open-ended points presets (TIMED / zero-cap CUSTOM) — ball-cap UI, not classic court.
    private static func usesOpenEndedPointsUi(preset: WatchScoringPreset?, rules: WatchScoringRules) -> Bool {
        if preset == .timed { return true }
        if preset == .custom, !rules.ballsInGames, rules.totalPointsPerSet <= 0 { return true }
        return false
    }

    /// `sport + preset → UI` (padel/tennis classic; rally boards per sport; open-ended → americano).
    static func resolve(game: WatchGame?, rules: WatchScoringRules) -> WatchLiveScoringUiId {
        let sport = game?.resolvedSport ?? .padel
        let preset = game?.scoringPreset.flatMap { WatchScoringPreset(rawValue: $0.uppercased()) }

        if let preset, usesOpenEndedPointsUi(preset: preset, rules: rules) {
            return .americanoPoints
        }

        switch sport {
        case .padel, .tennis:
            if rules.isClassic { return .classicCourt }
            if sport == .tennis, let preset, tennisClassicPresets.contains(preset), preset != .timed {
                if preset == .custom, !rules.ballsInGames { break }
                if preset != .custom { return .classicCourt }
            }
        default:
            break
        }

        if sport == .tableTennis, game?.usesRallySetScoring == true, !rules.isClassic {
            return .tableTennisBoard
        }

        if rules.isBallBudgetPoints { return .americanoPoints }

        switch sport {
        case .badminton, .pickleball, .squash:
            if game?.usesRallySetScoring == true, !rules.isClassic {
                return .rallyPointsBoard
            }
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

    var resolvedOfficiatingLevel: WatchOfficiatingLevel {
        WatchOfficiatingResolver.resolve(
            sport: resolvedSport,
            preset: scoringPreset,
            gameMetadata: nil
        )
    }
}
