import XCTest
@testable import BandejaWatch_Watch_App

/// Engine parity with `Backend/src/services/results/liveScoringEngine/core.ts` edge paths.
@MainActor
final class WatchLiveScoringEngineParityTests: XCTestCase {
    private func classicState(
        rules: WatchScoringRules,
        sets: [WatchSetWrite]? = nil,
        pointState: WatchLivePointState,
        pointsPlayed: Int,
        deuceCount: Int = 0
    ) -> WatchLiveScoringState {
        var state = WatchLiveScoringEngine.makeInitialState(rules: rules, initialSets: sets)
        state.classic = WatchLiveClassicState(
            pointState: pointState,
            withinSetTieBreak: false,
            tieBreakA: 0,
            tieBreakB: 0,
            classicPointsPlayedInGame: pointsPlayed,
            deuceCount: deuceCount
        )
        return state
    }

    // MARK: legacy `.deuce` point state (core.ts unscore / applyClassicPoint)

    func testUnscoreFromLegacyDeuceGoesToFortyThirty() {
        let rules = WatchScoringRulebook.skeleton(for: .classicBo3)
        let state = classicState(rules: rules, pointState: .deuce, pointsPlayed: 6)

        let a = WatchLiveScoringEngine.unscorePoint(state: state, side: .teamA, rules: rules)
        XCTAssertTrue(a.changed)
        if case .regular(let pa, let pb) = a.state.classic?.pointState {
            XCTAssertEqual(pa, .thirty)
            XCTAssertEqual(pb, .forty)
        } else {
            XCTFail("expected 30:40 after unscoring team A from deuce")
        }

        let b = WatchLiveScoringEngine.unscorePoint(state: state, side: .teamB, rules: rules)
        XCTAssertTrue(b.changed)
        if case .regular(let pa, let pb) = b.state.classic?.pointState {
            XCTAssertEqual(pa, .forty)
            XCTAssertEqual(pb, .thirty)
        } else {
            XCTFail("expected 40:30 after unscoring team B from deuce")
        }
    }

    func testScoreFromLegacyDeuceWithGoldenPointGivesAdvantage() {
        var rules = WatchScoringRulebook.skeleton(for: .classicBo3)
        rules.deucesBeforeGoldenPoint = 0
        XCTAssertTrue(rules.isGoldenPointActive(deuceCount: 0))
        let state = classicState(rules: rules, pointState: .deuce, pointsPlayed: 6)

        let result = WatchLiveScoringEngine.scorePoint(state: state, side: .teamB, rules: rules)
        XCTAssertTrue(result.changed)
        XCTAssertEqual(result.state.sets[0].teamB, 0, "legacy deuce never awards the game directly")
        if case .advantage(let side) = result.state.classic?.pointState {
            XCTAssertEqual(side, .teamB)
        } else {
            XCTFail("expected advantage team B from legacy deuce")
        }
    }

    func testGoldenPointFromRegularFortyAllStillAwardsGame() {
        var rules = WatchScoringRulebook.skeleton(for: .classicBo3)
        rules.deucesBeforeGoldenPoint = 0
        let state = classicState(rules: rules, pointState: .regular(teamA: .forty, teamB: .forty), pointsPlayed: 6)
        let result = WatchLiveScoringEngine.scorePoint(state: state, side: .teamA, rules: rules)
        XCTAssertTrue(result.changed)
        XCTAssertEqual(result.state.sets[0].teamA, 1)
    }

    // MARK: ensureSetExists never truncates supplemental rows (core.ts 477-489)

    func testSupplementalRowsBeyondMaxSetsSurviveScoring() {
        let rules = WatchScoringRulebook.skeleton(for: .classicBo3)
        let sets = [
            WatchSetWrite(teamA: 6, teamB: 4),
            WatchSetWrite(teamA: 4, teamB: 6),
            WatchSetWrite(teamA: 0, teamB: 0),
            WatchSetWrite(teamA: 3, teamB: 2, isTieBreak: false, role: .extraGames),
            WatchSetWrite(teamA: 1, teamB: 0, isTieBreak: false, role: .extraGames),
        ]
        var state = classicState(
            rules: rules,
            sets: sets,
            pointState: .regular(teamA: .forty, teamB: .zero),
            pointsPlayed: 3
        )
        state.activeSetIndex = 2
        state.optionalDeciderFormat = "REGULAR_SET"

        let scored = WatchLiveScoringEngine.scorePoint(state: state, side: .teamA, rules: rules)
        XCTAssertTrue(scored.changed)
        XCTAssertEqual(scored.state.sets.count, 5, "rows beyond maxSetsPlayed must be preserved")
        XCTAssertEqual(scored.state.sets[2].teamA, 1)
        XCTAssertEqual(scored.state.sets[3].resolvedRole, .extraGames)
        XCTAssertEqual(scored.state.sets[4].teamA, 1)

        let unscored = WatchLiveScoringEngine.unscorePoint(state: scored.state, side: .teamA, rules: rules)
        XCTAssertTrue(unscored.changed)
        XCTAssertEqual(unscored.state.sets.count, 5)
    }

    func testWithinSetTieBreakFinishKeepsRowRole() {
        let rules = WatchScoringRulebook.skeleton(for: .classicBo3)
        var state = WatchLiveScoringEngine.makeInitialState(
            rules: rules,
            initialSets: [
                WatchSetWrite(teamA: 6, teamB: 6),
                WatchSetWrite(teamA: 0, teamB: 0),
            ]
        )
        state.classic = WatchLiveClassicState(
            pointState: .regular(teamA: .zero, teamB: .zero),
            withinSetTieBreak: true,
            tieBreakA: 6,
            tieBreakB: 4,
            classicPointsPlayedInGame: 0
        )
        let result = WatchLiveScoringEngine.scorePoint(state: state, side: .teamA, rules: rules)
        XCTAssertTrue(result.changed)
        XCTAssertEqual(result.state.sets[0].teamA, 7)
        XCTAssertEqual(result.state.sets[0].teamB, 6)
        XCTAssertEqual(result.state.sets[0].resolvedRole, .official)
        XCTAssertFalse(result.state.sets[0].isTieBreak)
    }
}
