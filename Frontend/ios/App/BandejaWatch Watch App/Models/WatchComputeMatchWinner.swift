import Foundation

/// Mirrors `Frontend/src/utils/scoring/matchWinner.ts` for official match rows (table / generic).
enum WatchMatchWinnerSide: Sendable, Equatable {
    case teamA
    case teamB
}

enum WatchComputeMatchWinner {
    private static func isSetPlayed(_ s: WatchSetWrite) -> Bool {
        s.teamA > 0 || s.teamB > 0
    }

    private static func isOfficialMatchSet(_ s: WatchSetWrite) -> Bool {
        s.resolvedRole == .official
    }

    private static func setWinner(_ s: WatchSetWrite) -> WatchMatchWinnerSide? {
        guard isSetPlayed(s) else { return nil }
        if s.teamA > s.teamB { return .teamA }
        if s.teamB > s.teamA { return .teamB }
        return nil
    }

    static func computeMatchWinner(sets: [WatchSetWrite], rules: WatchScoringRules) -> WatchMatchWinnerSide? {
        let playedSets = sets.filter(isSetPlayed).filter(isOfficialMatchSet)
        guard !playedSets.isEmpty else { return nil }

        if rules.winnerOfMatch == .bySets {
            var a = 0
            var b = 0
            for s in playedSets {
                guard let w = setWinner(s) else { continue }
                switch w {
                case .teamA: a += 1
                case .teamB: b += 1
                }
            }
            if a >= rules.minSetsToWin { return .teamA }
            if b >= rules.minSetsToWin { return .teamB }
            if a == b { return nil }
            if rules.fixedNumberOfSets > 0, playedSets.count >= rules.fixedNumberOfSets {
                return a > b ? .teamA : .teamB
            }
            return nil
        }

        var a = 0
        var b = 0
        for s in playedSets {
            a += s.teamA
            b += s.teamB
        }
        if a > b { return .teamA }
        if b > a { return .teamB }
        return nil
    }

    static func isMatchDecided(sets: [WatchSetWrite], rules: WatchScoringRules) -> Bool {
        computeMatchWinner(sets: sets, rules: rules) != nil
    }

    // MARK: - Live scoring (completed rows only; mirrors `matchWinnerLive.ts` + `isLegalSetScore`)

    private static func completedOfficialSetsForLive(sets: [WatchSetWrite], rules: WatchScoringRules) -> [WatchSetWrite] {
        var out: [WatchSetWrite] = []
        for (i, set) in sets.enumerated() {
            guard isOfficialMatchSet(set), isSetPlayed(set) else { continue }
            if !WatchValidateSet.isLegalSetScore(
                teamA: set.teamA,
                teamB: set.teamB,
                rules: rules,
                setIndex: i,
                sets: sets,
                isTieBreakFlag: set.isTieBreak
            ) {
                continue
            }
            out.append(set)
        }
        return out
    }

    static func computeMatchWinnerLiveScoring(sets: [WatchSetWrite], rules: WatchScoringRules) -> WatchMatchWinnerSide? {
        let playedSets = completedOfficialSetsForLive(sets: sets, rules: rules)
        guard !playedSets.isEmpty else { return nil }

        if rules.winnerOfMatch == .bySets {
            var a = 0
            var b = 0
            for s in playedSets {
                guard let w = setWinner(s) else { continue }
                switch w {
                case .teamA: a += 1
                case .teamB: b += 1
                }
            }
            if a >= rules.minSetsToWin { return .teamA }
            if b >= rules.minSetsToWin { return .teamB }
            if a == b { return nil }
            let anyBallOfficial = sets.filter(isOfficialMatchSet).filter(isSetPlayed).count
            if rules.fixedNumberOfSets > 0, anyBallOfficial >= rules.fixedNumberOfSets {
                return a > b ? .teamA : .teamB
            }
            return nil
        }

        var a = 0
        var b = 0
        for s in playedSets {
            a += s.teamA
            b += s.teamB
        }
        if a > b { return .teamA }
        if b > a { return .teamB }
        return nil
    }

    static func isMatchDecidedForLiveScoring(sets: [WatchSetWrite], rules: WatchScoringRules) -> Bool {
        computeMatchWinnerLiveScoring(sets: sets, rules: rules) != nil
    }

    /// Official points row: exact total and draw rules (mirrors `validatePointsSet` + live freeze).
    static func isPointsOfficialBudgetExhausted(activeSet: WatchSetWrite?, rules: WatchScoringRules) -> Bool {
        guard rules.isPoints, rules.totalPointsPerSet > 0 else { return false }
        guard let s = activeSet, s.resolvedRole == .official else { return false }
        guard s.teamA + s.teamB == rules.totalPointsPerSet else { return false }
        if !rules.allowDrawPerSet, s.teamA == s.teamB { return false }
        return true
    }
}
