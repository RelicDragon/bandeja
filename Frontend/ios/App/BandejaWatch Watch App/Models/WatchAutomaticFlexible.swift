import Foundation

/// Parity with FE `utils/liveScoring/automaticFlexible.ts`.
enum WatchAutomaticFlexible {
    enum RecordMode: String, Sendable {
        case games = "GAMES"
        case americanoPoints = "AMERICANO_POINTS"
    }

    enum ContinueChoice: String, Sendable {
        case continueSet = "CONTINUE"
        case end = "END"
    }

    private static func isPristineMatchStart(_ state: WatchLiveScoringState) -> Bool {
        guard state.activeSetIndex == 0 else { return false }
        return state.sets.allSatisfy { $0.teamA == 0 && $0.teamB == 0 }
    }

    private static func activeSetDecisive(_ state: WatchLiveScoringState) -> Bool {
        guard let set = state.sets[safe: state.activeSetIndex] else { return false }
        return (set.teamA > 0 || set.teamB > 0) && set.teamA != set.teamB
    }

    private static func setPlayed(_ set: WatchSetWrite) -> Bool {
        set.teamA > 0 || set.teamB > 0
    }

    private static func isActiveAutomaticSetClosed(
        state: WatchLiveScoringState,
        rules: WatchScoringRules
    ) -> Bool {
        guard let set = state.sets[safe: state.activeSetIndex], setPlayed(set) else { return false }
        if set.isTieBreak {
            return WatchValidateSet.isClosedAutomaticSetScore(set, rules: rules)
        }
        if state.automaticRecordMode == RecordMode.americanoPoints.rawValue || state.mode == .points {
            return state.automaticOpenEndedSetConfirmed == true
        }
        if state.timedClassicSetLocked == true { return true }
        return WatchValidateSet.isClosedAutomaticSetScore(set, rules: rules)
    }

    private static func closedAutomaticOfficialSets(
        state: WatchLiveScoringState,
        rules: WatchScoringRules
    ) -> [WatchSetWrite] {
        let official = WatchLiveScoringEngine.splitOfficialSupplemental(state.sets).official
        var closed: [WatchSetWrite] = []
        for (i, s) in official.enumerated() {
            guard setPlayed(s) else { continue }
            if i < state.activeSetIndex {
                closed.append(s)
            } else if i == state.activeSetIndex, isActiveAutomaticSetClosed(state: state, rules: rules) {
                closed.append(s)
            }
        }
        return closed
    }

    private static func countClosedSetsWon(_ closed: [WatchSetWrite]) -> (a: Int, b: Int) {
        var a = 0
        var b = 0
        for s in closed {
            if s.teamA > s.teamB { a += 1 }
            else if s.teamB > s.teamA { b += 1 }
        }
        return (a, b)
    }

    static func isAutomaticOpenEndedPointsSet(state: WatchLiveScoringState, rules: WatchScoringRules) -> Bool {
        guard rules.isClassicAutomaticRelaxed else { return false }
        if state.automaticRecordMode != RecordMode.americanoPoints.rawValue, state.mode != .points {
            return false
        }
        guard state.mode == .points else { return false }
        guard let set = state.sets[safe: state.activeSetIndex] else { return false }
        return !set.isTieBreak
    }

    static func automaticRecordModeChoicePending(state: WatchLiveScoringState, rules: WatchScoringRules) -> Bool {
        guard rules.isClassicAutomaticRelaxed else { return false }
        if state.automaticRecordMode != nil { return false }
        if state.automaticEarlyFinish == true { return false }
        return isPristineMatchStart(state)
    }

    static func optionalContinueSetPending(
        state: WatchLiveScoringState,
        rules: WatchScoringRules,
        canAdvance: (WatchLiveScoringState, WatchScoringRules) -> Bool,
        deciderPending: (WatchLiveScoringState, WatchScoringRules) -> Bool
    ) -> Bool {
        guard rules.isClassicAutomaticRelaxed else { return false }
        guard state.automaticRecordMode != nil else { return false }
        if state.automaticEarlyFinish == true { return false }
        if deciderPending(state, rules) { return false }
        if isAutomaticLiveMatchComplete(state: state, rules: rules) { return false }
        return canAdvance(state, rules)
    }

    static func canConfirmAutomaticOpenEndedSet(
        state: WatchLiveScoringState,
        rules: WatchScoringRules,
        deciderPending: (WatchLiveScoringState, WatchScoringRules) -> Bool
    ) -> Bool {
        guard isAutomaticOpenEndedPointsSet(state: state, rules: rules) else { return false }
        if state.automaticEarlyFinish == true { return false }
        if state.automaticOpenEndedSetConfirmed == true { return false }
        if deciderPending(state, rules) { return false }
        guard activeSetDecisive(state) else { return false }
        if isAutomaticLiveMatchComplete(state: state, rules: rules) { return false }
        return true
    }

    static func applyAutomaticOpenEndedSetConfirm(
        state: WatchLiveScoringState,
        rules: WatchScoringRules,
        deciderPending: (WatchLiveScoringState, WatchScoringRules) -> Bool
    ) -> WatchLiveScoringEngine.ActionResult {
        guard canConfirmAutomaticOpenEndedSet(state: state, rules: rules, deciderPending: deciderPending) else {
            return .init(state: state, changed: false)
        }
        var copy = state
        copy.automaticOpenEndedSetConfirmed = true
        return .init(state: copy, changed: true)
    }

    static func applyAutomaticRecordMode(
        state: WatchLiveScoringState,
        rules: WatchScoringRules,
        mode: RecordMode
    ) -> WatchLiveScoringEngine.ActionResult {
        guard automaticRecordModeChoicePending(state: state, rules: rules) else {
            return .init(state: state, changed: false)
        }
        var copy = state
        copy.automaticRecordMode = mode.rawValue
        switch mode {
        case .americanoPoints:
            copy.mode = .points
            copy.classic = nil
        case .games:
            copy.mode = .classic
            copy.classic = WatchLiveClassicState(
                pointState: .regular(teamA: .zero, teamB: .zero),
                withinSetTieBreak: false,
                tieBreakA: 0,
                tieBreakB: 0,
                classicPointsPlayedInGame: 0
            )
        }
        return .init(state: copy, changed: true)
    }

    static func applyAutomaticContinueChoice(
        state: WatchLiveScoringState,
        rules: WatchScoringRules,
        choice: ContinueChoice,
        canAdvance: (WatchLiveScoringState, WatchScoringRules) -> Bool,
        deciderPending: (WatchLiveScoringState, WatchScoringRules) -> Bool,
        advance: (WatchLiveScoringState, WatchScoringRules) -> WatchLiveScoringEngine.ActionResult
    ) -> WatchLiveScoringEngine.ActionResult {
        guard optionalContinueSetPending(
            state: state,
            rules: rules,
            canAdvance: canAdvance,
            deciderPending: deciderPending
        ) else {
            return .init(state: state, changed: false)
        }
        if choice == .end {
            var copy = state
            copy.automaticEarlyFinish = true
            return .init(state: copy, changed: true)
        }
        return advance(state, rules)
    }

    /// Live Automatic match over: early finish, or enough *closed* sets won.
    static func isAutomaticLiveMatchComplete(state: WatchLiveScoringState, rules: WatchScoringRules) -> Bool {
        guard rules.isClassicAutomaticRelaxed else { return false }
        if state.automaticEarlyFinish == true { return true }
        let closed = closedAutomaticOfficialSets(state: state, rules: rules)
        let counts = countClosedSetsWon(closed)
        if max(counts.a, counts.b) >= rules.minSetsToWin { return true }
        if rules.maxSetsPlayed > 0, closed.count >= rules.maxSetsPlayed { return true }
        return false
    }

    static func inferAutomaticRecordMode(state: WatchLiveScoringState, rules: WatchScoringRules) -> RecordMode? {
        guard rules.isClassicAutomaticRelaxed else { return nil }
        if let raw = state.automaticRecordMode, let mode = RecordMode(rawValue: raw) {
            return mode
        }
        if isPristineMatchStart(state) { return nil }
        return state.mode == .points ? .americanoPoints : .games
    }
}
