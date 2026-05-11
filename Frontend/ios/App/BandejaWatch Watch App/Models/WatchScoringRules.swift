import Foundation

enum WatchScoringPreset: String, Sendable {
    case classicBo3 = "CLASSIC_BEST_OF_3"
    case classicBo5 = "CLASSIC_BEST_OF_5"
    case classicSuperTb = "CLASSIC_SUPER_TIEBREAK"
    case classicProSet = "CLASSIC_PRO_SET"
    case classicSingleSet = "CLASSIC_SINGLE_SET"
    case classicShortSet = "CLASSIC_SHORT_SET"
    case classicTimed = "CLASSIC_TIMED"
    case points16 = "POINTS_16"
    case points21 = "POINTS_21"
    case points24 = "POINTS_24"
    case points32 = "POINTS_32"
    case timed = "TIMED"
    case custom = "CUSTOM"
}

enum WatchWinnerOfMatch: String, Sendable {
    case bySets = "BY_SETS"
    case byScores = "BY_SCORES"
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
    var hasGoldenPoint: Bool
    var allowRemoveSet: Bool
    var allowIncompleteRegularSetGames: Bool

    var isClassic: Bool { ballsInGames && winnerOfMatch == .bySets }
    var isPoints: Bool { !ballsInGames && totalPointsPerSet > 0 }

    var gamesScoreForTieBreak: Int { tieBreakGameAtGames ?? max(gamesPerSet, 1) }
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
            hasGoldenPoint: false,
            allowRemoveSet: allowRemoveSet,
            allowIncompleteRegularSetGames: false
        )
    }

    static func skeleton(for preset: WatchScoringPreset) -> WatchScoringRules {
        switch preset {
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
        case .points16:
            return pointsRule(total: 16)
        case .points21:
            return pointsRule(total: 21)
        case .points24:
            return pointsRule(total: 24)
        case .points32:
            return pointsRule(total: 32)
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
        let skeleton: WatchScoringRules = preset.map(self.skeleton(for:)) ?? derive(from: game)
        var r = skeleton
        r.maxPointsPerTeam = game?.maxPointsPerTeam ?? 0
        r.allowIncompleteRegularSetGames = (game?.isMatchTimerEnabled ?? false) || preset == .classicTimed
        let goldenApplies = r.ballsInGames && r.winnerOfMatch == .bySets
        r.hasGoldenPoint = goldenApplies && (game?.hasGoldenPoint ?? false)
        return r
    }

    private static func derive(from game: WatchGame?) -> WatchScoringRules {
        let fixedNumberOfSets = max(0, game?.fixedNumberOfSets ?? 0)
        let totalPointsPerSet = max(0, game?.maxTotalPointsPerSet ?? 0)
        let ballsInGames = game?.ballsInGames ?? false
        let winnerOfMatch = WatchWinnerOfMatch(rawValue: game?.winnerOfMatch ?? "") ?? .byScores

        if ballsInGames, winnerOfMatch == .bySets {
            if fixedNumberOfSets == 5 { return skeleton(for: .classicBo5) }
            if fixedNumberOfSets == 1 { return skeleton(for: .classicProSet) }
            return skeleton(for: .classicBo3)
        }
        if !ballsInGames, totalPointsPerSet > 0 {
            return pointsRule(total: totalPointsPerSet)
        }
        if !ballsInGames, fixedNumberOfSets <= 1 {
            return skeleton(for: .timed)
        }
        var r = skeleton(for: .custom)
        r.fixedNumberOfSets = fixedNumberOfSets
        r.maxSetsPlayed = fixedNumberOfSets > 0 ? fixedNumberOfSets : 99
        r.totalPointsPerSet = totalPointsPerSet
        r.ballsInGames = ballsInGames
        r.winnerOfMatch = winnerOfMatch
        return r
    }
}
