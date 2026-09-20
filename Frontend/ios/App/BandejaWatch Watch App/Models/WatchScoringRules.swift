import Foundation

enum WatchScoringPreset: String, Sendable {
    case classicAutomatic = "CLASSIC_AUTOMATIC"
    case classicBo3 = "CLASSIC_BEST_OF_3"
    case classicBo5 = "CLASSIC_BEST_OF_5"
    case classicSuperTb = "CLASSIC_SUPER_TIEBREAK"
    case classicProSet = "CLASSIC_PRO_SET"
    case classicSingleSet = "CLASSIC_SINGLE_SET"
    case classicShortSet = "CLASSIC_SHORT_SET"
    case classicFast4 = "CLASSIC_FAST4"
    case classicTimed = "CLASSIC_TIMED"
    case points12 = "POINTS_12"
    case points15 = "POINTS_15"
    case points16 = "POINTS_16"
    case points21 = "POINTS_21"
    case points24 = "POINTS_24"
    case points32 = "POINTS_32"
    case points11 = "POINTS_11"
    case bestOf3_11 = "BEST_OF_3_11"
    case bestOf3_15 = "BEST_OF_3_15"
    case bestOf5_11 = "BEST_OF_5_11"
    case bestOf3_21 = "BEST_OF_3_21"
    case par11 = "PAR_11"
    case singleGame21 = "SINGLE_GAME_21"
    case timed = "TIMED"
    case custom = "CUSTOM"
}

enum WatchWinnerOfMatch: String, Sendable {
    case bySets = "BY_SETS"
    case byScores = "BY_SCORES"
}

/// Mirror of `StrictValidationId` in `Backend/src/shared/sportPresetMeta.ts`.
enum WatchStrictValidation: String, Sendable {
    case none = "NONE"
    case bwf21 = "BWF_21"
    case bwf15 = "BWF_15"
    case pickleballRally11 = "PICKLEBALL_RALLY_11"
    case classicTimedRelaxed = "CLASSIC_TIMED_RELAXED"
    case classicAutomaticRelaxed = "CLASSIC_AUTOMATIC_RELAXED"

    /// `isBwfStrictValidation` in `strictValidation.ts`.
    var isBwf: Bool { self == .bwf21 || self == .bwf15 }

    /// `STRICT_BY_SPORT_PRESET` in `sportPresetMeta.ts` (sport + preset keyed; unknown → NONE).
    static func resolve(sport: WatchSport?, preset: WatchScoringPreset?) -> WatchStrictValidation {
        guard let sport, let preset else { return .none }
        switch (sport, preset) {
        case (.badminton, .bestOf3_21): return .bwf21
        case (.badminton, .bestOf3_15): return .bwf15
        case (.pickleball, .bestOf3_11): return .pickleballRally11
        case (.tennis, .classicTimed), (.tennis, .classicSingleSet): return .classicTimedRelaxed
        case (.padel, .classicAutomatic): return .classicAutomaticRelaxed
        case (.padel, .classicTimed): return .classicTimedRelaxed
        default: return .none
        }
    }
}

/// Mirror of `ScoringRules` in `Backend/src/services/results/liveScoringEngine/rulebook.ts`.
/// Keep field semantics aligned with that file — Watch scoring logic reads from here.
struct WatchScoringRules: Sendable, Equatable {
    var ballsInGames: Bool
    var fixedNumberOfSets: Int
    var minSetsToWin: Int
    var maxSetsPlayed: Int

    var gamesPerSet: Int
    var winBy: Int
    var tieBreakGameAtGames: Int?
    var tieBreakGameFirstTo: Int
    var tieBreakGameWinBy: Int

    var superTieBreakReplacesDeciderAtIndex: Int?
    var superTieBreakFirstTo: Int
    var superTieBreakWinBy: Int

    var totalPointsPerSet: Int
    var maxPointsPerTeam: Int
    var winnerOfMatch: WatchWinnerOfMatch

    var allowDrawPerSet: Bool
    var deucesBeforeGoldenPoint: Int?
    var allowRemoveSet: Bool
    var allowIncompleteRegularSetGames: Bool
    /// Sport + preset strict-validation id (`rulebook.ts` `strictValidation`).
    var strictValidation: WatchStrictValidation

    /// Mirrors `isClassicAutomaticRelaxedScores` (`strictValidation === 'CLASSIC_AUTOMATIC_RELAXED'`).
    var isClassicAutomaticRelaxed: Bool { strictValidation == .classicAutomaticRelaxed }

    var isClassic: Bool { ballsInGames && winnerOfMatch == .bySets }

    func isGoldenPointActive(deuceCount: Int) -> Bool {
        guard let threshold = deucesBeforeGoldenPoint else { return false }
        return deuceCount >= threshold
    }

    /// `DEUCES_BEFORE_GOLDEN_POINT_MAX` in `Backend/src/shared/gameFormat/goldenPoint.ts`.
    static let deucesBeforeGoldenPointMax = 4

    /// `clampDeucesBeforeGoldenPoint`: nil = off; out-of-range (`< 0` or `> 4`) → nil.
    static func clampDeucesBeforeGoldenPoint(_ raw: Int?) -> Int? {
        guard let raw else { return nil }
        if raw < 0 || raw > deucesBeforeGoldenPointMax { return nil }
        return raw
    }

    /// Ball-budget Americano (`isPointsRules` in FE `rulebook.ts`).
    var isBallBudgetPoints: Bool {
        !ballsInGames && totalPointsPerSet > 0 && winBy == 0 && winnerOfMatch == .byScores
    }

    /// Best-of-N games to a point cap with win-by-2 (`isRallyGameRules`).
    var isRallyGame: Bool {
        !ballsInGames && winnerOfMatch == .bySets && fixedNumberOfSets > 1
            && totalPointsPerSet > 0 && winBy >= 2
    }

    /// Single game to a point cap with win-by-2 (`isRallyPointsRules`).
    var isRallyPoints: Bool {
        !ballsInGames && fixedNumberOfSets <= 1 && totalPointsPerSet > 0 && winBy >= 2
    }

    var usesRallyPointCap: Bool { isRallyGame || isRallyPoints }

    /// Legacy alias: ball-budget only (not rally best-of).
    var isPoints: Bool { isBallBudgetPoints }

    /// Open-ended `TIMED` / zero-cap `CUSTOM` (parity with web `timedCustomPresets`).
    var isOpenEndedPointsPreset: Bool {
        !ballsInGames && totalPointsPerSet <= 0 && winnerOfMatch == .byScores && fixedNumberOfSets <= 1
    }

    var gamesScoreForTieBreak: Int { tieBreakGameAtGames ?? max(gamesPerSet, 1) }

    func pointRaceCompleted(teamA: Int, teamB: Int) -> Bool {
        let winner = max(teamA, teamB)
        let loser = min(teamA, teamB)
        let target = max(totalPointsPerSet, 1)
        let winBy = max(winBy, 1)
        return winner >= target && (winner - loser) >= winBy
    }
}

enum WatchScoringRulebook {
    private static let classicBo3 = base(
        ballsInGames: true,
        fixedNumberOfSets: 3,
        minSetsToWin: 2,
        maxSetsPlayed: 3,
        gamesPerSet: 6,
        winBy: 2,
        tieBreakGameAtGames: 6,
        tieBreakGameFirstTo: 7,
        tieBreakGameWinBy: 2,
        superTieBreakReplacesDeciderAtIndex: nil,
        superTieBreakFirstTo: 10,
        superTieBreakWinBy: 2,
        totalPointsPerSet: 0,
        winnerOfMatch: .bySets,
        allowRemoveSet: false
    )

    private static func base(
        ballsInGames: Bool,
        fixedNumberOfSets: Int,
        minSetsToWin: Int,
        maxSetsPlayed: Int,
        gamesPerSet: Int,
        winBy: Int,
        tieBreakGameAtGames: Int?,
        tieBreakGameFirstTo: Int,
        tieBreakGameWinBy: Int,
        superTieBreakReplacesDeciderAtIndex: Int?,
        superTieBreakFirstTo: Int,
        superTieBreakWinBy: Int,
        totalPointsPerSet: Int,
        winnerOfMatch: WatchWinnerOfMatch,
        allowRemoveSet: Bool
    ) -> WatchScoringRules {
        WatchScoringRules(
            ballsInGames: ballsInGames,
            fixedNumberOfSets: fixedNumberOfSets,
            minSetsToWin: minSetsToWin,
            maxSetsPlayed: maxSetsPlayed,
            gamesPerSet: gamesPerSet,
            winBy: winBy,
            tieBreakGameAtGames: tieBreakGameAtGames,
            tieBreakGameFirstTo: tieBreakGameFirstTo,
            tieBreakGameWinBy: tieBreakGameWinBy,
            superTieBreakReplacesDeciderAtIndex: superTieBreakReplacesDeciderAtIndex,
            superTieBreakFirstTo: superTieBreakFirstTo,
            superTieBreakWinBy: superTieBreakWinBy,
            totalPointsPerSet: totalPointsPerSet,
            maxPointsPerTeam: 0,
            winnerOfMatch: winnerOfMatch,
            allowDrawPerSet: false,
            deucesBeforeGoldenPoint: nil,
            allowRemoveSet: allowRemoveSet,
            allowIncompleteRegularSetGames: false,
            strictValidation: .none
        )
    }

    /// Preset-only skeleton (`PRESETS[preset]` in `rulebook.ts`) with PADEL strict validation
    /// (Watch default sport). Prefer `skeleton(for:sport:)` when the sport is known.
    static func skeleton(for preset: WatchScoringPreset) -> WatchScoringRules {
        skeleton(for: preset, sport: .padel)
    }

    /// `PRESETS[preset]` + `getStrictValidationForPreset(sport, preset)`.
    static func skeleton(for preset: WatchScoringPreset, sport: WatchSport?) -> WatchScoringRules {
        var r = presetSkeleton(for: preset)
        r.strictValidation = WatchStrictValidation.resolve(sport: sport, preset: preset)
        return r
    }

    private static func presetSkeleton(for preset: WatchScoringPreset) -> WatchScoringRules {
        switch preset {
        case .classicAutomatic:
            var r = classicBo3
            r.allowRemoveSet = true
            return r
        case .classicBo3:
            return classicBo3
        case .classicBo5:
            var r = classicBo3
            r.fixedNumberOfSets = 5
            r.minSetsToWin = 3
            r.maxSetsPlayed = 5
            return r
        case .classicSuperTb:
            var r = classicBo3
            r.superTieBreakReplacesDeciderAtIndex = 2
            return r
        case .classicProSet:
            var r = classicBo3
            r.fixedNumberOfSets = 1
            r.minSetsToWin = 1
            r.maxSetsPlayed = 1
            r.gamesPerSet = 9
            r.tieBreakGameAtGames = 8
            return r
        case .classicShortSet:
            var r = classicBo3
            r.gamesPerSet = 4
            r.tieBreakGameAtGames = 3
            return r
        case .classicFast4:
            var r = classicBo3
            r.gamesPerSet = 4
            r.tieBreakGameAtGames = 3
            r.tieBreakGameFirstTo = 5
            return r
        case .classicSingleSet, .classicTimed:
            return base(
                ballsInGames: true,
                fixedNumberOfSets: 1,
                minSetsToWin: 1,
                maxSetsPlayed: 1,
                gamesPerSet: 6,
                winBy: 2,
                tieBreakGameAtGames: 6,
                tieBreakGameFirstTo: 7,
                tieBreakGameWinBy: 2,
                superTieBreakReplacesDeciderAtIndex: nil,
                superTieBreakFirstTo: 10,
                superTieBreakWinBy: 2,
                totalPointsPerSet: 0,
                winnerOfMatch: .bySets,
                allowRemoveSet: false
            )
        case .points12:
            return pointsRule(total: 12)
        case .points15:
            return pointsRule(total: 15)
        case .points16:
            return pointsRule(total: 16)
        case .points21:
            return pointsRule(total: 21)
        case .points24:
            return pointsRule(total: 24)
        case .points32:
            return pointsRule(total: 32)
        case .points11:
            return rallyPointsRule(total: 11)
        case .bestOf3_11:
            return rallyBestOf(sets: 3, pointsPerSet: 11)
        case .bestOf3_15:
            return rallyBestOf(sets: 3, pointsPerSet: 15)
        case .bestOf5_11:
            return rallyBestOf(sets: 5, pointsPerSet: 11)
        case .bestOf3_21:
            return rallyBestOf(sets: 3, pointsPerSet: 21)
        case .par11:
            return rallyPointsRule(total: 11)
        case .singleGame21:
            return rallyPointsRule(total: 21)
        case .timed:
            return pointsRule(total: 0)
        case .custom:
            var r = pointsRule(total: 0)
            r.fixedNumberOfSets = 0
            r.maxSetsPlayed = 99
            r.allowRemoveSet = true
            return r
        }
    }

    private static func rallyBestOf(sets: Int, pointsPerSet: Int) -> WatchScoringRules {
        var r = pointsRule(total: pointsPerSet)
        r.fixedNumberOfSets = sets
        r.minSetsToWin = (sets / 2) + 1
        r.maxSetsPlayed = sets
        r.winnerOfMatch = .bySets
        r.winBy = 2
        return r
    }


    private static func rallyPointsRule(total: Int) -> WatchScoringRules {
        var r = pointsRule(total: total)
        r.winBy = 2
        return r
    }

    private static func pointsRule(total: Int) -> WatchScoringRules {
        base(
            ballsInGames: false,
            fixedNumberOfSets: 1,
            minSetsToWin: 1,
            maxSetsPlayed: 1,
            gamesPerSet: 0,
            winBy: 0,
            tieBreakGameAtGames: nil,
            tieBreakGameFirstTo: 0,
            tieBreakGameWinBy: 0,
            superTieBreakReplacesDeciderAtIndex: nil,
            superTieBreakFirstTo: 0,
            superTieBreakWinBy: 0,
            totalPointsPerSet: total,
            winnerOfMatch: .byScores,
            allowRemoveSet: false
        )
    }

    /// Mirrors `getRules(game)` in `Backend/.../rulebook.ts`.
    static func rules(for game: WatchGame?) -> WatchScoringRules {
        let preset = (game?.scoringPreset).flatMap { WatchScoringPreset(rawValue: $0.uppercased()) }
        // Backend keys strict validation on the raw `game.sport` (null → NONE), not a padel fallback.
        let sport = (game?.sport).flatMap { WatchSport(rawValue: $0.uppercased()) }
        var r: WatchScoringRules = preset.map { presetSkeleton(for: $0) } ?? derive(from: game)
        r.maxPointsPerTeam = game?.maxPointsPerTeam ?? 0
        // `getStrictValidationForPreset` returns NONE without a preset (derived rules).
        let strict = WatchStrictValidation.resolve(sport: sport, preset: preset)
        r.strictValidation = strict
        // `Boolean(game?.matchTimerEnabled)` — the raw flag, not the UI helper that also needs a cap.
        r.allowIncompleteRegularSetGames =
            game?.matchTimerEnabled == true
            || preset == .classicTimed
            || strict == .classicTimedRelaxed
            || strict == .classicAutomaticRelaxed
        let goldenApplies = r.ballsInGames && r.winnerOfMatch == .bySets
        if goldenApplies {
            let raw = game?.deucesBeforeGoldenPoint ?? (preset == .classicFast4 ? 0 : nil)
            r.deucesBeforeGoldenPoint = WatchScoringRules.clampDeucesBeforeGoldenPoint(raw)
        } else {
            r.deucesBeforeGoldenPoint = nil
        }
        let ppt = game?.pointsPerTie ?? 0
        if preset == nil {
            r.allowDrawPerSet = ppt > 0
        } else {
            r.allowDrawPerSet =
                r.winnerOfMatch == .byScores
                && (ppt > 0 || (!r.ballsInGames && r.totalPointsPerSet > 0))
        }
        return r
    }

    private static func derive(from game: WatchGame?) -> WatchScoringRules {
        let fixedNumberOfSets = max(0, game?.fixedNumberOfSets ?? 0)
        let totalPointsPerSet = max(0, game?.maxTotalPointsPerSet ?? 0)
        let ballsInGames = game?.ballsInGames ?? false
        let winnerOfMatch = WatchWinnerOfMatch(rawValue: game?.winnerOfMatch ?? "") ?? .byScores

        if ballsInGames, winnerOfMatch == .bySets {
            if fixedNumberOfSets == 5 { return presetSkeleton(for: .classicBo5) }
            // `deriveFromGame`: one fixed set → pro set (9 games, TB at 8), no gameType heuristics.
            if fixedNumberOfSets == 1 { return presetSkeleton(for: .classicProSet) }
            return presetSkeleton(for: .classicBo3)
        }
        if !ballsInGames, totalPointsPerSet > 0 {
            return pointsRule(total: totalPointsPerSet)
        }
        if !ballsInGames, fixedNumberOfSets <= 1 {
            return presetSkeleton(for: .timed)
        }
        var r = presetSkeleton(for: .custom)
        r.fixedNumberOfSets = fixedNumberOfSets
        r.maxSetsPlayed = fixedNumberOfSets > 0 ? fixedNumberOfSets : 99
        r.totalPointsPerSet = totalPointsPerSet
        r.ballsInGames = ballsInGames
        r.winnerOfMatch = winnerOfMatch
        return r
    }
}
