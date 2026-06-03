import Foundation

/// Mirrors `Frontend/src/utils/scoring/setKind.ts` + `validateSet.ts` for `isLegalSetScore` parity with web live scoring.
enum WatchValidateSet {
    enum WatchSetKind: Equatable {
        case regular
        case tiebreakGame
        case superTiebreak
        case points
        case timed
        case custom
    }

    private static func isSupplemental(_ s: WatchSetWrite) -> Bool {
        s.resolvedRole != .official
    }

    private static func setWinner(_ s: WatchSetWrite) -> WatchMatchWinnerSide? {
        guard s.teamA > 0 || s.teamB > 0 else { return nil }
        if s.teamA > s.teamB { return .teamA }
        if s.teamB > s.teamA { return .teamB }
        return nil
    }

    static func countSetsWonOfficial(_ sets: [WatchSetWrite]) -> (a: Int, b: Int) {
        var a = 0
        var b = 0
        for s in sets where s.resolvedRole == .official {
            guard let w = setWinner(s) else { continue }
            switch w {
            case .teamA: a += 1
            case .teamB: b += 1
            }
        }
        return (a, b)
    }

    static func watchGetSetKind(
        setIndex: Int,
        sets: [WatchSetWrite],
        rules: WatchScoringRules,
        isTieBreakOverride: Bool? = nil
    ) -> WatchSetKind {
        guard setIndex >= 0, setIndex < sets.count else { return .custom }
        let row = sets[setIndex]
        if isSupplemental(row) { return .custom }
        if rules.isBallBudgetPoints || rules.isRallyGame || rules.isRallyPoints { return .points }
        if !rules.ballsInGames, rules.totalPointsPerSet == 0, rules.winnerOfMatch == .byScores, rules.fixedNumberOfSets == 1 {
            return .timed
        }
        if !rules.isClassic { return .custom }

        let effective: [WatchSetWrite] = sets.enumerated().map { i, s in
            guard i == setIndex else { return s }
            var copy = s
            if let o = isTieBreakOverride {
                copy.isTieBreak = o
            }
            return copy
        }
        let current = effective[setIndex]

        if let stbIdx = rules.superTieBreakReplacesDeciderAtIndex, setIndex == stbIdx {
            let priorPlayed = effective[..<setIndex].filter { $0.teamA > 0 || $0.teamB > 0 }
            if priorPlayed.count == setIndex {
                let counts = countSetsWonOfficial(Array(effective[..<setIndex]))
                if counts.a == counts.b, counts.a >= setIndex / 2 {
                    return .superTiebreak
                }
            }
            if current.isTieBreak { return .superTiebreak }
        }

        if current.isTieBreak { return .tiebreakGame }
        return .regular
    }

    private static func validateClassicRegularSet(a: Int, b: Int, rules: WatchScoringRules) -> Bool {
        let target = rules.gamesPerSet
        let winBy = rules.winBy
        let tbAt = rules.tieBreakGameAtGames

        if a == b {
            if let tbAt, a == tbAt { return true }
            return false
        }
        let hi = max(a, b)
        let lo = min(a, b)

        if hi < target { return false }
        if winBy >= 2, hi == target + 1, lo < target - 1 {
            return false
        }
        if winBy >= 2, let tbAt, hi == tbAt + 1, lo == tbAt {
            return true
        }
        if winBy >= 2, hi > target + 1, hi - lo != 2 {
            return false
        }
        if winBy >= 2, hi == target, lo > target - 2 {
            return false
        }
        if winBy == 1, hi > target, hi - lo != 1 {
            return false
        }
        return true
    }

    private static func validateClassicTiebreakGame(a: Int, b: Int, rules: WatchScoringRules) -> Bool {
        if a == b { return false }
        let hi = max(a, b)
        let lo = min(a, b)
        let firstTo = rules.tieBreakGameFirstTo
        let winBy = rules.tieBreakGameWinBy
        if hi < firstTo { return false }
        if hi - lo < winBy { return false }
        if hi > firstTo, hi - lo != winBy {
            return false
        }
        return true
    }

    private static func validateSuperTiebreak(a: Int, b: Int, rules: WatchScoringRules) -> Bool {
        if a == b { return false }
        let hi = max(a, b)
        let lo = min(a, b)
        let firstTo = rules.superTieBreakFirstTo
        let winBy = rules.superTieBreakWinBy
        if hi < firstTo { return false }
        if hi - lo < winBy { return false }
        if hi > firstTo, hi - lo != winBy {
            return false
        }
        return true
    }

    private static func validateRallyPointGame(a: Int, b: Int, rules: WatchScoringRules) -> Bool {
        if a == b { return a == 0 }
        let target = rules.totalPointsPerSet
        let hi = max(a, b)
        let lo = min(a, b)
        if hi < target { return true }
        if hi == target, lo > target - rules.winBy { return false }
        if hi > target, hi - lo != rules.winBy {
            if hi - lo < rules.winBy { return false }
            return false
        }
        return true
    }

    private static func validatePointsSet(a: Int, b: Int, rules: WatchScoringRules) -> Bool {
        if rules.usesRallyPointCap {
            return validateRallyPointGame(a: a, b: b, rules: rules)
        }
        if rules.totalPointsPerSet > 0, a + b != rules.totalPointsPerSet {
            return false
        }
        if !rules.allowDrawPerSet, a == b, a > 0 {
            return false
        }
        return true
    }

    private static func validateTimedSet(_: Int, _: Int) -> Bool { true }

    private static func validateCustomSet(a: Int, b: Int, rules: WatchScoringRules) -> Bool {
        if rules.totalPointsPerSet > 0, a + b > rules.totalPointsPerSet {
            return false
        }
        return true
    }

    static func isLegalSetScore(
        teamA a: Int,
        teamB b: Int,
        rules: WatchScoringRules,
        setIndex: Int,
        sets: [WatchSetWrite],
        isTieBreakFlag: Bool?
    ) -> Bool {
        if a < 0 || b < 0 { return false }

        let maxTeam = rules.maxPointsPerTeam
        if maxTeam > 0, (a > maxTeam || b > maxTeam) {
            return false
        }

        let kind = watchGetSetKind(setIndex: setIndex, sets: sets, rules: rules, isTieBreakOverride: isTieBreakFlag)

        if a == 0, b == 0 { return true }

        switch kind {
        case .points:
            return validatePointsSet(a: a, b: b, rules: rules)
        case .timed:
            return validateTimedSet(a, b)
        case .custom:
            return validateCustomSet(a: a, b: b, rules: rules)
        case .superTiebreak:
            return validateSuperTiebreak(a: a, b: b, rules: rules)
        case .tiebreakGame:
            return validateClassicTiebreakGame(a: a, b: b, rules: rules)
        case .regular:
            if rules.isClassic, rules.allowIncompleteRegularSetGames {
                return validateTimedSet(a, b)
            }
            if rules.isClassic {
                return validateClassicRegularSet(a: a, b: b, rules: rules)
            }
            return true
        }
    }
}
