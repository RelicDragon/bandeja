import Foundation

/// Pure live scoring engine (parity with FE `utils/liveScoring/core.ts`).
enum WatchLiveScoringEngine {
    struct ActionResult: Sendable {
        var state: WatchLiveScoringState
        var changed: Bool
    }

    // MARK: - State lifecycle

    static func makeInitialState(rules: WatchScoringRules, initialSets: [WatchSetWrite]?) -> WatchLiveScoringState {
        let sets = normalizedSets(initialSets)
        let mode: WatchLiveScoringMode = rules.isClassic ? .classic : .points
        var classic: WatchLiveClassicState?
        if mode == .classic {
            classic = WatchLiveClassicState(
                pointState: .regular(teamA: .zero, teamB: .zero),
                withinSetTieBreak: tieBreakActive(in: sets, index: 0, rules: rules),
                tieBreakA: 0,
                tieBreakB: 0,
                classicPointsPlayedInGame: 0
            )
        }
        return WatchLiveScoringState(
            activeSetIndex: 0,
            mode: mode,
            sets: sets,
            classic: classic,
            firstServerTeam: nil,
            firstServerDoublesPlayerIndex: nil,
            pointsServeRotation: nil,
            matchStartCourtEndsSwapped: nil,
            matchStartTeamASidesMirrored: nil,
            matchStartTeamBSidesMirrored: nil,
            serveGuideSkipped: nil,
            optionalDeciderFormat: nil,
            timedClassicSetLocked: nil,
            pointWinnerLog: nil
        )
    }

    static func parseState(
        _ raw: WatchLiveScoringState,
        rules: WatchScoringRules,
        fallbackSets: [WatchSetWrite]?
    ) -> WatchLiveScoringState {
        let sets = normalizedSets(raw.sets.isEmpty ? fallbackSets : raw.sets)
        let active = min(max(raw.activeSetIndex, 0), max(sets.count - 1, 0))
        let mode = raw.mode
        var classic = raw.classic
        if mode == .classic, classic == nil {
            classic = WatchLiveClassicState(
                pointState: .regular(teamA: .zero, teamB: .zero),
                withinSetTieBreak: tieBreakActive(in: sets, index: active, rules: rules),
                tieBreakA: 0,
                tieBreakB: 0,
                classicPointsPlayedInGame: 0
            )
        }
        return WatchLiveScoringState(
            activeSetIndex: active,
            mode: mode,
            sets: sets,
            classic: classic,
            firstServerTeam: raw.firstServerTeam,
            firstServerDoublesPlayerIndex: raw.firstServerDoublesPlayerIndex,
            pointsServeRotation: raw.pointsServeRotation,
            matchStartCourtEndsSwapped: raw.matchStartCourtEndsSwapped,
            matchStartTeamASidesMirrored: raw.matchStartTeamASidesMirrored,
            matchStartTeamBSidesMirrored: raw.matchStartTeamBSidesMirrored,
            serveGuideSkipped: raw.serveGuideSkipped,
            optionalDeciderFormat: raw.optionalDeciderFormat,
            timedClassicSetLocked: raw.timedClassicSetLocked,
            pointWinnerLog: raw.pointWinnerLog,
            officiatingLetPending: raw.officiatingLetPending
        )
    }

    // MARK: - Mutations

    static func scorePoint(
        state: WatchLiveScoringState,
        side: TeamSide,
        rules: WatchScoringRules
    ) -> ActionResult {
        if state.timedClassicSetLocked == true {
            return ActionResult(state: state, changed: false)
        }
        if rules.isClassic, optionalDeciderChoicePending(state: state, rules: rules) {
            return ActionResult(state: state, changed: false)
        }

        var copy = state
        ensureSetExists(state: &copy, rules: rules)

        if copy.mode != .classic {
            guard var row = copy.sets[safe: copy.activeSetIndex] else {
                return ActionResult(state: state, changed: false)
            }
            if side == .teamA { row.teamA += 1 } else { row.teamB += 1 }
            copy.sets[copy.activeSetIndex] = row
            var log = copy.pointWinnerLog ?? []
            log.append(side)
            copy.pointWinnerLog = log
            return ActionResult(state: copy, changed: true)
        }

        guard var classic = copy.classic else {
            return ActionResult(state: state, changed: false)
        }

        if activeSetIsSuperTieBreak(state: copy) {
            guard var row = copy.sets[safe: copy.activeSetIndex] else {
                return ActionResult(state: state, changed: false)
            }
            if pointRaceCompleted(
                teamA: row.teamA,
                teamB: row.teamB,
                target: superTieBreakTarget(rules: rules),
                winBy: max(rules.superTieBreakWinBy, 1)
            ) {
                return ActionResult(state: state, changed: false)
            }
            if side == .teamA { row.teamA += 1 } else { row.teamB += 1 }
            copy.sets[copy.activeSetIndex] = row
            copy.classic = classic
            return ActionResult(state: copy, changed: true)
        }

        if classic.withinSetTieBreak {
            if side == .teamA { classic.tieBreakA += 1 } else { classic.tieBreakB += 1 }
            if pointRaceCompleted(
                teamA: classic.tieBreakA,
                teamB: classic.tieBreakB,
                target: tieBreakTarget(rules: rules),
                winBy: max(rules.tieBreakGameWinBy, 1)
            ) {
                finishWithinSetTieBreak(state: &copy, classic: &classic, rules: rules)
            }
            copy.classic = classic
            return ActionResult(state: copy, changed: true)
        }

        applyClassicPoint(state: &copy, classic: &classic, side: side, rules: rules)
        applyClassicPointsAfterUserScore(state: &copy, classic: &classic)
        copy.classic = classic
        return ActionResult(state: copy, changed: true)
    }

    static func unscorePoint(
        state: WatchLiveScoringState,
        side: TeamSide,
        rules: WatchScoringRules
    ) -> ActionResult {
        if state.timedClassicSetLocked == true {
            return ActionResult(state: state, changed: false)
        }

        var copy = state
        ensureSetExists(state: &copy, rules: rules)

        if copy.mode != .classic {
            guard var row = copy.sets[safe: copy.activeSetIndex] else {
                return ActionResult(state: state, changed: false)
            }
            let prev = side == .teamA ? row.teamA : row.teamB
            guard prev > 0 else { return ActionResult(state: state, changed: false) }
            if side == .teamA { row.teamA -= 1 } else { row.teamB -= 1 }
            copy.sets[copy.activeSetIndex] = row
            if rules.usesRallyPointCap || rules.isRallyGame {
                var log = copy.pointWinnerLog ?? []
                if let last = log.last, last == side {
                    log.removeLast()
                } else {
                    log = []
                }
                copy.pointWinnerLog = log.isEmpty ? nil : log
            }
            return ActionResult(state: copy, changed: true)
        }

        guard var classic = copy.classic else {
            return ActionResult(state: state, changed: false)
        }

        if activeSetIsSuperTieBreak(state: copy) {
            guard var row = copy.sets[safe: copy.activeSetIndex] else {
                return ActionResult(state: state, changed: false)
            }
            let prev = side == .teamA ? row.teamA : row.teamB
            guard prev > 0 else { return ActionResult(state: state, changed: false) }
            if side == .teamA { row.teamA -= 1 } else { row.teamB -= 1 }
            copy.sets[copy.activeSetIndex] = row
            copy.classic = classic
            return ActionResult(state: copy, changed: true)
        }

        if classic.withinSetTieBreak {
            if side == .teamA, classic.tieBreakA > 0 {
                classic.tieBreakA -= 1
                copy.classic = classic
                return ActionResult(state: copy, changed: true)
            }
            if side == .teamB, classic.tieBreakB > 0 {
                classic.tieBreakB -= 1
                copy.classic = classic
                return ActionResult(state: copy, changed: true)
            }
            let n = gamesScoreForTieBreak(rules: rules)
            guard var row = copy.sets[safe: copy.activeSetIndex] else {
                return ActionResult(state: state, changed: false)
            }
            if row.teamA == n, row.teamB == n {
                let prev = side == .teamA ? row.teamA : row.teamB
                if prev > 0 {
                    if side == .teamA { row.teamA -= 1 } else { row.teamB -= 1 }
                    copy.sets[copy.activeSetIndex] = row
                    classic.withinSetTieBreak = false
                    copy.classic = classic
                    applyClassicPointsAfterUnscore(state: &copy)
                    return ActionResult(state: copy, changed: true)
                }
            }
            return ActionResult(state: state, changed: false)
        }

        switch classic.pointState {
        case .advantage:
            classic.pointState = .regular(teamA: .forty, teamB: .forty)
            copy.classic = classic
            applyClassicPointsAfterUnscore(state: &copy)
            return ActionResult(state: copy, changed: true)
        case .deuce:
            classic.pointState = .regular(teamA: .forty, teamB: .forty)
            copy.classic = classic
            applyClassicPointsAfterUnscore(state: &copy)
            return ActionResult(state: copy, changed: true)
        case .regular(let a, let b):
            if side == .teamA {
                if let p = a.previous {
                    classic.pointState = .regular(teamA: p, teamB: b)
                    copy.classic = classic
                    applyClassicPointsAfterUnscore(state: &copy)
                    return ActionResult(state: copy, changed: true)
                }
                guard var row = copy.sets[safe: copy.activeSetIndex], row.teamA > 0 else {
                    return ActionResult(state: state, changed: false)
                }
                row.teamA -= 1
                copy.sets[copy.activeSetIndex] = row
                classic.pointState = .regular(teamA: .forty, teamB: .forty)
                copy.classic = classic
                applyClassicPointsAfterUnscore(state: &copy)
                return ActionResult(state: copy, changed: true)
            }
            if let p = b.previous {
                classic.pointState = .regular(teamA: a, teamB: p)
                copy.classic = classic
                applyClassicPointsAfterUnscore(state: &copy)
                return ActionResult(state: copy, changed: true)
            }
            guard var row = copy.sets[safe: copy.activeSetIndex], row.teamB > 0 else {
                return ActionResult(state: state, changed: false)
            }
            row.teamB -= 1
            copy.sets[copy.activeSetIndex] = row
            classic.pointState = .regular(teamA: .forty, teamB: .forty)
            copy.classic = classic
            applyClassicPointsAfterUnscore(state: &copy)
            return ActionResult(state: copy, changed: true)
        }
    }

    static func advanceLiveSet(state: WatchLiveScoringState, rules: WatchScoringRules, superTieBreak: Bool) -> ActionResult {
        guard canAdvanceLiveSet(state: state, rules: rules) else {
            return ActionResult(state: state, changed: false)
        }
        var copy = state
        copy.activeSetIndex += 1
        copy.timedClassicSetLocked = nil
        copy.pointWinnerLog = []
        ensureSetExists(state: &copy, rules: rules)
        if var row = copy.sets[safe: copy.activeSetIndex] {
            let empty = row.teamA == 0 && row.teamB == 0
            if row.resolvedRole == .official, empty {
                row.isTieBreak = superTieBreak
            } else if row.resolvedRole != .official {
                row.isTieBreak = false
            }
            copy.sets[copy.activeSetIndex] = row
        }
        if copy.mode == .classic {
            copy.classic = WatchLiveClassicState(
                pointState: .regular(teamA: .zero, teamB: .zero),
                withinSetTieBreak: tieBreakActive(in: copy.sets, index: copy.activeSetIndex, rules: rules),
                tieBreakA: 0,
                tieBreakB: 0,
                classicPointsPlayedInGame: 0
            )
        }
        return ActionResult(state: copy, changed: true)
    }

    // MARK: - Queries

    static func canAdvanceLiveSet(state: WatchLiveScoringState, rules: WatchScoringRules) -> Bool {
        if state.activeSetIndex + 1 >= max(rules.maxSetsPlayed, 1) { return false }
        guard let set = state.sets[safe: state.activeSetIndex] else { return false }
        let official = splitOfficialSupplemental(state.sets).official
        if state.mode != .classic {
            if rules.isRallyGame {
                if !pointRaceCompleted(
                    teamA: set.teamA,
                    teamB: set.teamB,
                    target: rules.totalPointsPerSet,
                    winBy: max(rules.winBy, 2)
                ) { return false }
            } else if set.teamA == 0 && set.teamB == 0 {
                return false
            }
        } else if set.isTieBreak {
            if !pointRaceCompleted(
                teamA: set.teamA,
                teamB: set.teamB,
                target: superTieBreakTarget(rules: rules),
                winBy: max(rules.superTieBreakWinBy, 1)
            ) { return false }
        } else if state.classic?.withinSetTieBreak == true {
            return false
        } else if !classicSetCompleted(
            teamA: set.teamA,
            teamB: set.teamB,
            rules: rules,
            timedLocked: state.timedClassicSetLocked == true
        ) {
            return false
        }
        if WatchComputeMatchWinner.isMatchDecidedForLiveScoring(sets: official, rules: rules) { return false }
        return true
    }

    static func canUnscore(state: WatchLiveScoringState, side: TeamSide, rules: WatchScoringRules) -> Bool {
        if state.timedClassicSetLocked == true { return false }
        let official = splitOfficialSupplemental(state.sets).official
        if WatchComputeMatchWinner.isMatchDecidedForLiveScoring(sets: official, rules: rules) { return false }

        let supplemental = state.sets[safe: state.activeSetIndex].map { $0.resolvedRole != .official } ?? false
        if supplemental {
            guard let row = state.sets[safe: state.activeSetIndex] else { return false }
            return side == .teamA ? row.teamA > 0 : row.teamB > 0
        }

        if state.mode != .classic {
            guard let row = state.sets[safe: state.activeSetIndex] else { return false }
            return side == .teamA ? row.teamA > 0 : row.teamB > 0
        }

        guard let classic = state.classic else { return false }

        if activeSetIsSuperTieBreak(state: state) {
            guard let row = state.sets[safe: state.activeSetIndex] else { return false }
            return side == .teamA ? row.teamA > 0 : row.teamB > 0
        }

        if classic.withinSetTieBreak {
            if side == .teamA, classic.tieBreakA > 0 { return true }
            if side == .teamB, classic.tieBreakB > 0 { return true }
            let n = gamesScoreForTieBreak(rules: rules)
            guard let row = state.sets[safe: state.activeSetIndex] else { return false }
            return row.teamA == n && row.teamB == n && (side == .teamA ? row.teamA > 0 : row.teamB > 0)
        }

        switch classic.pointState {
        case .advantage, .deuce:
            return true
        case .regular(let a, let b):
            if side == .teamA {
                if a != .zero { return true }
                return (state.sets[safe: state.activeSetIndex]?.teamA ?? 0) > 0
            }
            if b != .zero { return true }
            return (state.sets[safe: state.activeSetIndex]?.teamB ?? 0) > 0
        }
    }

    static func optionalDeciderChoicePending(state: WatchLiveScoringState, rules: WatchScoringRules) -> Bool {
        if state.optionalDeciderFormat != nil { return false }
        return isOptionalDeciderContext(state: state, rules: rules)
    }

    static func activeSetIsCompleted(state: WatchLiveScoringState, rules: WatchScoringRules) -> Bool {
        guard let set = state.sets[safe: state.activeSetIndex] else { return false }
        if rules.isBallBudgetPoints {
            return WatchComputeMatchWinner.isPointsOfficialBudgetExhausted(activeSet: set, rules: rules)
        }
        if rules.isOpenEndedPointsPreset, state.timedClassicSetLocked == true {
            return set.teamA > 0 || set.teamB > 0
        }
        if rules.usesRallyPointCap {
            return rules.pointRaceCompleted(teamA: set.teamA, teamB: set.teamB)
        }
        if set.isTieBreak {
            return pointRaceCompleted(
                teamA: set.teamA,
                teamB: set.teamB,
                target: superTieBreakTarget(rules: rules),
                winBy: max(rules.superTieBreakWinBy, 1)
            )
        }
        if state.classic?.withinSetTieBreak == true { return false }
        return classicSetCompleted(
            teamA: set.teamA,
            teamB: set.teamB,
            rules: rules,
            timedLocked: state.timedClassicSetLocked == true
        )
    }

    // MARK: - Post-mutation (FE parity)

    struct AutoAdvanceResult {
        let state: WatchLiveScoringState
        /// When set, the caller must show the super-TB decider choice UI before advancing to this set index.
        let pendingOptionalDeciderAtSetIndex: Int?
    }

    static func autoAdvanceCompletedSets(state: WatchLiveScoringState, rules: WatchScoringRules) -> WatchLiveScoringState {
        guard rules.isClassic else { return state }
        var s = state
        while canAdvanceLiveSet(state: s, rules: rules) {
            let next = advanceLiveSet(
                state: s,
                rules: rules,
                superTieBreak: mandatedSuperTieBreak(at: s.activeSetIndex + 1, rules: rules)
            )
            if !next.changed { break }
            s = next.state
        }
        return normalizeLiveSetsAfterDecision(state: s, rules: rules)
    }

    /// Walks forward through completed sets. Stops before advancing into an optional super-TB decider
    /// so the UI can prompt the user (Watch-specific; golden harness uses `autoAdvanceCompletedSets` instead).
    static func autoAdvanceCompletedSetsAllowingOptionalDeciderPrompt(
        state: WatchLiveScoringState,
        rules: WatchScoringRules
    ) -> AutoAdvanceResult {
        guard rules.isClassic else {
            return AutoAdvanceResult(state: state, pendingOptionalDeciderAtSetIndex: nil)
        }
        var s = state
        while canAdvanceLiveSet(state: s, rules: rules) {
            let nextIndex = s.activeSetIndex + 1
            if shouldPromptOptionalDeciderBeforeAdvancing(to: nextIndex, state: s, rules: rules) {
                return AutoAdvanceResult(state: s, pendingOptionalDeciderAtSetIndex: nextIndex)
            }
            let next = advanceLiveSet(
                state: s,
                rules: rules,
                superTieBreak: mandatedSuperTieBreak(at: nextIndex, rules: rules)
            )
            if !next.changed { break }
            s = next.state
        }
        let normalized = normalizeLiveSetsAfterDecision(state: s, rules: rules)
        return AutoAdvanceResult(state: normalized, pendingOptionalDeciderAtSetIndex: nil)
    }

    static func shouldPromptOptionalDeciderBeforeAdvancing(
        to nextIndex: Int,
        state: WatchLiveScoringState,
        rules: WatchScoringRules
    ) -> Bool {
        if state.optionalDeciderFormat != nil { return false }
        guard rules.isClassic, !rules.isBallBudgetPoints else { return false }
        if rules.superTieBreakReplacesDeciderAtIndex != nil { return false }
        if state.sets[safe: nextIndex].map({ $0.resolvedRole != .official }) ?? false { return false }
        let deciderIndex = max(0, rules.maxSetsPlayed - 1)
        guard nextIndex == deciderIndex else { return false }
        return previousOfficialSetsTiedBeforeIndex(nextIndex, state: state)
    }

    static func normalizeLiveSetsAfterDecision(state: WatchLiveScoringState, rules: WatchScoringRules) -> WatchLiveScoringState {
        guard rules.isClassic, !rules.isBallBudgetPoints else { return state }
        let official = splitOfficialSupplemental(state.sets).official
        guard WatchComputeMatchWinner.isMatchDecidedForLiveScoring(sets: official, rules: rules) else {
            return state
        }
        var copy = state
        let supplemental = splitOfficialSupplemental(copy.sets).supplemental
        let trimmedOfficial = official.filter { $0.teamA > 0 || $0.teamB > 0 }
        let officialOut = trimmedOfficial.isEmpty ? official : trimmedOfficial
        copy.sets = officialOut + supplemental
        var lastScored = 0
        for (i, s) in officialOut.enumerated() where s.teamA > 0 || s.teamB > 0 {
            lastScored = i
        }
        copy.activeSetIndex = min(copy.activeSetIndex, lastScored)
        return copy
    }

    // MARK: - Private

    private static func mandatedSuperTieBreak(at index: Int, rules: WatchScoringRules) -> Bool {
        rules.superTieBreakReplacesDeciderAtIndex == index
    }

    static func previousOfficialSetsTiedBeforeIndex(_ nextIndex: Int, state: WatchLiveScoringState) -> Bool {
        guard nextIndex >= 2 else { return false }
        var aWins = 0
        var bWins = 0
        for i in 0..<nextIndex {
            guard let s = state.sets[safe: i], s.resolvedRole == .official else { continue }
            guard s.teamA > 0 || s.teamB > 0 else { continue }
            guard s.teamA != s.teamB else { continue }
            if s.isTieBreak {
                if s.teamA > s.teamB { aWins += 1 } else { bWins += 1 }
            } else if s.teamA > s.teamB {
                aWins += 1
            } else {
                bWins += 1
            }
        }
        return aWins == bWins && aWins > 0
    }

    private static func applyClassicPointsAfterUserScore(state: inout WatchLiveScoringState, classic: inout WatchLiveClassicState) {
        if classic.withinSetTieBreak || activeSetIsSuperTieBreak(state: state) { return }
        switch classic.pointState {
        case .regular(let a, let b):
            if a == .zero && b == .zero {
                classic.classicPointsPlayedInGame = 0
                return
            }
            classic.classicPointsPlayedInGame += 1
        case .deuce, .advantage:
            classic.classicPointsPlayedInGame += 1
        }
    }

    private static func applyClassicPointsAfterUnscore(state: inout WatchLiveScoringState) {
        guard var classic = state.classic else { return }
        if classic.withinSetTieBreak || activeSetIsSuperTieBreak(state: state) { return }
        switch classic.pointState {
        case .regular(let a, let b):
            if a == .zero && b == .zero {
                classic.classicPointsPlayedInGame = 0
            } else if a == .forty && b == .forty {
                classic.classicPointsPlayedInGame = max(8, classic.classicPointsPlayedInGame - 1)
            } else {
                classic.classicPointsPlayedInGame = max(0, classic.classicPointsPlayedInGame - 1)
            }
        case .deuce, .advantage:
            classic.classicPointsPlayedInGame = max(0, classic.classicPointsPlayedInGame - 1)
        }
        state.classic = classic
    }

    private static func applyClassicPoint(
        state: inout WatchLiveScoringState,
        classic: inout WatchLiveClassicState,
        side: TeamSide,
        rules: WatchScoringRules
    ) {
        let deuceCount = classic.deuceCount
        switch classic.pointState {
        case .regular(let a, let b):
            if a == .forty && b == .forty && rules.isGoldenPointActive(deuceCount: deuceCount) {
                awardGame(state: &state, classic: &classic, side: side, rules: rules)
                return
            }
            if side == .teamA {
                if a == .forty && b != .forty {
                    awardGame(state: &state, classic: &classic, side: .teamA, rules: rules)
                } else if a == .forty && b == .forty {
                    if rules.isGoldenPointActive(deuceCount: deuceCount) {
                        awardGame(state: &state, classic: &classic, side: .teamA, rules: rules)
                    } else {
                        classic.pointState = .advantage(.teamA)
                    }
                } else {
                    classic.pointState = .regular(teamA: a.next ?? .forty, teamB: b)
                }
            } else {
                if b == .forty && a != .forty {
                    awardGame(state: &state, classic: &classic, side: .teamB, rules: rules)
                } else if a == .forty && b == .forty {
                    if rules.isGoldenPointActive(deuceCount: deuceCount) {
                        awardGame(state: &state, classic: &classic, side: .teamB, rules: rules)
                    } else {
                        classic.pointState = .advantage(.teamB)
                    }
                } else {
                    classic.pointState = .regular(teamA: a, teamB: b.next ?? .forty)
                }
            }
        case .deuce:
            if rules.isGoldenPointActive(deuceCount: deuceCount) {
                awardGame(state: &state, classic: &classic, side: side, rules: rules)
            } else {
                classic.pointState = .advantage(side)
            }
        case .advantage(let adv):
            if adv == side {
                awardGame(state: &state, classic: &classic, side: side, rules: rules)
            } else {
                classic.deuceCount += 1
                classic.pointState = .regular(teamA: .forty, teamB: .forty)
            }
        }
    }

    private static func awardGame(
        state: inout WatchLiveScoringState,
        classic: inout WatchLiveClassicState,
        side: TeamSide,
        rules: WatchScoringRules
    ) {
        ensureSetExists(state: &state, rules: rules)
        if side == .teamA {
            state.sets[state.activeSetIndex].teamA += 1
        } else {
            state.sets[state.activeSetIndex].teamB += 1
        }
        classic.pointState = .regular(teamA: .zero, teamB: .zero)
        classic.classicPointsPlayedInGame = 0
        classic.deuceCount = 0
        let row = state.sets[state.activeSetIndex]
        let tbAt = gamesScoreForTieBreak(rules: rules)
        if row.teamA == tbAt && row.teamB == tbAt {
            classic.withinSetTieBreak = true
            classic.tieBreakA = 0
            classic.tieBreakB = 0
        }
    }

    private static func finishWithinSetTieBreak(
        state: inout WatchLiveScoringState,
        classic: inout WatchLiveClassicState,
        rules: WatchScoringRules
    ) {
        let n = gamesScoreForTieBreak(rules: rules)
        let aWon = classic.tieBreakA > classic.tieBreakB
        state.sets[state.activeSetIndex] = WatchSetWrite(
            teamA: aWon ? n + 1 : n,
            teamB: aWon ? n : n + 1,
            isTieBreak: false
        )
        classic.tieBreakA = 0
        classic.tieBreakB = 0
        classic.withinSetTieBreak = false
    }

    private static func isOptionalDeciderContext(state: WatchLiveScoringState, rules: WatchScoringRules) -> Bool {
        if rules.superTieBreakReplacesDeciderAtIndex != nil { return false }
        if state.mode != .classic { return false }
        if rules.fixedNumberOfSets < 3 || rules.maxSetsPlayed < 3 { return false }
        let official = splitOfficialSupplemental(state.sets).official
        if official.count < 3 { return false }
        let prev = Array(official.dropLast())
        for s in prev {
            if s.isTieBreak {
                if !pointRaceCompleted(
                    teamA: s.teamA,
                    teamB: s.teamB,
                    target: superTieBreakTarget(rules: rules),
                    winBy: max(rules.superTieBreakWinBy, 1)
                ) { return false }
            } else if !classicSetCompleted(teamA: s.teamA, teamB: s.teamB, rules: rules, timedLocked: false) {
                return false
            }
        }
        let decider = official[official.count - 1]
        if decider.teamA > 0 || decider.teamB > 0 { return false }
        let deciderIdx = official.count - 1
        if state.activeSetIndex != deciderIdx { return false }
        var aWins = 0
        var bWins = 0
        for s in prev where s.teamA > 0 || s.teamB > 0 {
            if s.teamA > s.teamB { aWins += 1 }
            else if s.teamB > s.teamA { bWins += 1 }
        }
        return aWins == 1 && bWins == 1
    }

    private static func classicSetCompleted(
        teamA: Int,
        teamB: Int,
        rules: WatchScoringRules,
        timedLocked: Bool
    ) -> Bool {
        if timedLocked && rules.allowIncompleteRegularSetGames {
            return teamA > 0 || teamB > 0
        }
        let hi = max(teamA, teamB)
        let lo = min(teamA, teamB)
        let tbAt = gamesScoreForTieBreak(rules: rules)
        if hi == tbAt && lo == tbAt { return false }
        if hi == tbAt + 1 && lo == tbAt { return true }
        return hi >= rules.gamesPerSet && hi - lo >= max(rules.winBy, 1)
    }

    private static func pointRaceCompleted(teamA: Int, teamB: Int, target: Int, winBy: Int) -> Bool {
        let winner = max(teamA, teamB)
        let loser = min(teamA, teamB)
        return winner >= target && winner - loser >= winBy
    }

    private static func gamesScoreForTieBreak(rules: WatchScoringRules) -> Int {
        rules.tieBreakGameAtGames ?? max(rules.gamesPerSet, 6)
    }

    private static func tieBreakTarget(rules: WatchScoringRules) -> Int {
        rules.tieBreakGameFirstTo > 0 ? rules.tieBreakGameFirstTo : 7
    }

    private static func superTieBreakTarget(rules: WatchScoringRules) -> Int {
        rules.superTieBreakFirstTo > 0 ? rules.superTieBreakFirstTo : 10
    }

    private static func activeSetIsSuperTieBreak(state: WatchLiveScoringState) -> Bool {
        state.sets[safe: state.activeSetIndex]?.isTieBreak == true
    }

    private static func tieBreakActive(in sets: [WatchSetWrite], index: Int, rules: WatchScoringRules) -> Bool {
        guard rules.isClassic, let row = sets[safe: index], !row.isTieBreak else { return false }
        let tbAt = gamesScoreForTieBreak(rules: rules)
        return row.teamA == tbAt && row.teamB == tbAt
    }

    private static func normalizedSets(_ sets: [WatchSetWrite]?) -> [WatchSetWrite] {
        let input = sets ?? []
        if input.isEmpty {
            return [WatchSetWrite(teamA: 0, teamB: 0, isTieBreak: false)]
        }
        return input
    }

    private static func ensureSetExists(state: inout WatchLiveScoringState, rules: WatchScoringRules) {
        while state.activeSetIndex >= state.sets.count {
            state.sets.append(WatchSetWrite(teamA: 0, teamB: 0, isTieBreak: false))
        }
        let cap = max(rules.maxSetsPlayed, 1)
        if state.sets.count > cap {
            state.sets = Array(state.sets.prefix(cap))
        }
    }

    private static func splitOfficialSupplemental(_ rows: [WatchSetWrite]) -> (official: [WatchSetWrite], supplemental: [WatchSetWrite]) {
        if let idx = rows.firstIndex(where: { $0.resolvedRole != .official }) {
            return (Array(rows[..<idx]), Array(rows[idx...]))
        }
        return (rows, [])
    }
}
