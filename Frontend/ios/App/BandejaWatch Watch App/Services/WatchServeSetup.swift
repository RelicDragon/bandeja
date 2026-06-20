import Foundation

enum WatchServeSetup {
    static func needsServeSetup(state: WatchLiveScoringState, rules: WatchScoringRules) -> Bool {
        if state.serveGuideSkipped == true || state.firstServerTeam != nil { return false }
        if rules.usesRallyPointCap, state.mode == .points {
            return isPristinePointsStart(state) || officialSetsHavePlay(state)
        }
        if rules.isClassic, state.mode == .classic {
            return isPristineGameStart(state)
                || isPristineSuperTieBreakStart(state)
                || classicActiveSetHasPlay(state)
                || officialSetsHavePlay(state)
        }
        return false
    }

    private static func activeSetRow(_ state: WatchLiveScoringState) -> WatchSetWrite? {
        state.sets[safe: state.activeSetIndex]
    }

    private static func isSupplemental(_ set: WatchSetWrite) -> Bool {
        set.resolvedRole != .official
    }

    private static func isPristineGameStart(_ state: WatchLiveScoringState) -> Bool {
        guard let c = state.classic, !c.withinSetTieBreak else { return false }
        guard let set = activeSetRow(state), !set.isTieBreak, !isSupplemental(set) else { return false }
        guard set.teamA == 0, set.teamB == 0 else { return false }
        switch c.pointState {
        case .regular(let a, let b):
            return a == .zero && b == .zero && c.classicPointsPlayedInGame == 0
        default:
            return false
        }
    }

    private static func isPristinePointsStart(_ state: WatchLiveScoringState) -> Bool {
        guard state.mode == .points else { return false }
        guard let set = activeSetRow(state), !isSupplemental(set) else { return false }
        return set.teamA == 0 && set.teamB == 0
    }

    private static func isPristineSuperTieBreakStart(_ state: WatchLiveScoringState) -> Bool {
        guard state.mode == .classic else { return false }
        guard let set = activeSetRow(state), set.isTieBreak, !isSupplemental(set) else { return false }
        return set.teamA == 0 && set.teamB == 0
    }

    private static func officialSetsHavePlay(_ state: WatchLiveScoringState) -> Bool {
        state.sets.contains { $0.resolvedRole == .official && ($0.teamA > 0 || $0.teamB > 0) }
    }

    private static func classicActiveSetHasPlay(_ state: WatchLiveScoringState) -> Bool {
        guard let set = activeSetRow(state), !isSupplemental(set) else { return false }
        if set.teamA > 0 || set.teamB > 0 { return true }
        guard let c = state.classic else { return false }
        if c.withinSetTieBreak, c.tieBreakA > 0 || c.tieBreakB > 0 { return true }
        if set.isTieBreak, set.teamA > 0 || set.teamB > 0 { return true }
        switch c.pointState {
        case .regular(let a, let b):
            if a != .zero || b != .zero { return true }
        default:
            return true
        }
        return c.classicPointsPlayedInGame > 0
    }
}
