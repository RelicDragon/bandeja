import XCTest
@testable import BandejaWatch_Watch_App

@MainActor
final class WatchAutomaticFlexibleTests: XCTestCase {
    private var rules: WatchScoringRules {
        WatchScoringRulebook.skeleton(for: .classicAutomatic)
    }

    func testAutomaticSkeleton() {
        XCTAssertTrue(rules.isClassicAutomaticRelaxed)
        XCTAssertNil(rules.superTieBreakReplacesDeciderAtIndex)
        XCTAssertTrue(rules.allowRemoveSet)
    }

    func testRecordModeThenContinueThenOptionalDecider() {
        var state = WatchLiveScoringEngine.makeInitialState(rules: rules, initialSets: nil)
        XCTAssertTrue(
            WatchAutomaticFlexible.automaticRecordModeChoicePending(state: state, rules: rules)
        )
        XCTAssertFalse(
            WatchLiveScoringEngine.scorePoint(state: state, side: .teamA, rules: rules).changed
        )

        let mode = WatchLiveScoringEngine.applyAutomaticRecordMode(
            state: state,
            rules: rules,
            mode: .games
        )
        XCTAssertTrue(mode.changed)
        state = mode.state
        XCTAssertEqual(state.automaticRecordMode, "GAMES")
        XCTAssertEqual(state.mode, .classic)

        state.sets = [WatchSetWrite(teamA: 6, teamB: 4, isTieBreak: false)]
        state.activeSetIndex = 0
        state.classic = WatchLiveClassicState(
            pointState: .regular(teamA: .zero, teamB: .zero),
            withinSetTieBreak: false,
            tieBreakA: 0,
            tieBreakB: 0,
            classicPointsPlayedInGame: 0
        )
        XCTAssertTrue(
            WatchLiveScoringEngine.optionalContinueSetChoicePending(state: state, rules: rules)
        )
        XCTAssertFalse(
            WatchLiveScoringEngine.scorePoint(state: state, side: .teamA, rules: rules).changed
        )

        let continued = WatchLiveScoringEngine.applyAutomaticContinueChoice(
            state: state,
            rules: rules,
            choice: .continueSet
        )
        XCTAssertTrue(continued.changed)
        state = continued.state
        XCTAssertEqual(state.activeSetIndex, 1)

        state.sets = [
            WatchSetWrite(teamA: 6, teamB: 4, isTieBreak: false),
            WatchSetWrite(teamA: 4, teamB: 6, isTieBreak: false),
        ]
        state.activeSetIndex = 1
        let toDecider = WatchLiveScoringEngine.applyAutomaticContinueChoice(
            state: state,
            rules: rules,
            choice: .continueSet
        )
        XCTAssertTrue(toDecider.changed)
        state = toDecider.state
        XCTAssertEqual(state.activeSetIndex, 2)
        XCTAssertTrue(WatchLiveScoringEngine.optionalDeciderChoicePending(state: state, rules: rules))
    }

    func testAmericanoKeepsScoringUntilFinishSetThenEarlyEnd() {
        var state = WatchLiveScoringEngine.applyAutomaticRecordMode(
            state: WatchLiveScoringEngine.makeInitialState(rules: rules, initialSets: nil),
            rules: rules,
            mode: .americanoPoints
        ).state
        XCTAssertEqual(state.mode, .points)

        state = WatchLiveScoringEngine.scorePoint(state: state, side: .teamA, rules: rules).state
        XCTAssertEqual(state.sets[0].teamA, 1)
        XCTAssertFalse(
            WatchLiveScoringEngine.optionalContinueSetChoicePending(state: state, rules: rules)
        )
        XCTAssertTrue(
            WatchAutomaticFlexible.canConfirmAutomaticOpenEndedSet(
                state: state,
                rules: rules,
                deciderPending: WatchLiveScoringEngine.optionalDeciderChoicePending
            )
        )

        for i in 0..<8 {
            let side: TeamSide = i % 2 == 0 ? .teamB : .teamA
            let next = WatchLiveScoringEngine.scorePoint(state: state, side: side, rules: rules)
            XCTAssertTrue(next.changed)
            state = next.state
        }
        XCTAssertNotEqual(state.sets[0].teamA, state.sets[0].teamB)

        let finished = WatchLiveScoringEngine.applyAutomaticOpenEndedSetConfirm(
            state: state,
            rules: rules
        )
        XCTAssertTrue(finished.changed)
        state = finished.state
        XCTAssertTrue(
            WatchLiveScoringEngine.optionalContinueSetChoicePending(state: state, rules: rules)
        )
        XCTAssertFalse(
            WatchLiveScoringEngine.scorePoint(state: state, side: .teamA, rules: rules).changed
        )

        let ended = WatchLiveScoringEngine.applyAutomaticContinueChoice(
            state: state,
            rules: rules,
            choice: .end
        )
        XCTAssertTrue(ended.changed)
        XCTAssertEqual(ended.state.automaticEarlyFinish, true)
        XCTAssertTrue(
            WatchAutomaticFlexible.isAutomaticLiveMatchComplete(state: ended.state, rules: rules)
        )
    }

    func testAmericanoContinuesIntoOptionalSTB() {
        var state = WatchLiveScoringEngine.applyAutomaticRecordMode(
            state: WatchLiveScoringEngine.makeInitialState(rules: rules, initialSets: nil),
            rules: rules,
            mode: .americanoPoints
        ).state
        state.sets = [WatchSetWrite(teamA: 24, teamB: 18, isTieBreak: false)]
        state.activeSetIndex = 0
        state.automaticOpenEndedSetConfirmed = true
        state = WatchLiveScoringEngine.applyAutomaticContinueChoice(
            state: state,
            rules: rules,
            choice: .continueSet
        ).state
        XCTAssertEqual(state.activeSetIndex, 1)
        XCTAssertNil(state.automaticOpenEndedSetConfirmed)

        state.sets = [
            WatchSetWrite(teamA: 24, teamB: 18, isTieBreak: false),
            WatchSetWrite(teamA: 18, teamB: 24, isTieBreak: false),
        ]
        state.activeSetIndex = 1
        state.automaticOpenEndedSetConfirmed = true
        state = WatchLiveScoringEngine.applyAutomaticContinueChoice(
            state: state,
            rules: rules,
            choice: .continueSet
        ).state
        XCTAssertTrue(WatchLiveScoringEngine.optionalDeciderChoicePending(state: state, rules: rules))

        state.sets[2].isTieBreak = true
        state.optionalDeciderFormat = "SUPER_TIEBREAK"
        XCTAssertFalse(WatchLiveScoringEngine.optionalDeciderChoicePending(state: state, rules: rules))

        state.sets[2] = WatchSetWrite(teamA: 9, teamB: 8, isTieBreak: true)
        state = WatchLiveScoringEngine.scorePoint(state: state, side: .teamA, rules: rules).state
        XCTAssertEqual(state.sets[2].teamA, 10)
        XCTAssertEqual(state.sets[2].teamB, 8)
        XCTAssertTrue(
            WatchAutomaticFlexible.isAutomaticLiveMatchComplete(state: state, rules: rules)
        )
    }

    func testNoSilentAutoAdvanceForAutomatic() {
        var state = WatchLiveScoringEngine.applyAutomaticRecordMode(
            state: WatchLiveScoringEngine.makeInitialState(rules: rules, initialSets: nil),
            rules: rules,
            mode: .games
        ).state
        state.sets = [WatchSetWrite(teamA: 6, teamB: 4, isTieBreak: false)]
        state.activeSetIndex = 0
        let advanced = WatchLiveScoringEngine.autoAdvanceCompletedSetsAllowingOptionalDeciderPrompt(
            state: state,
            rules: rules
        )
        XCTAssertNil(advanced.pendingOptionalDeciderAtSetIndex)
        XCTAssertEqual(advanced.state.activeSetIndex, 0)
    }

    func testParsePreservesAutomaticFields() {
        var raw = WatchLiveScoringEngine.makeInitialState(rules: rules, initialSets: nil)
        raw.automaticRecordMode = "AMERICANO_POINTS"
        raw.mode = .points
        raw.classic = nil
        raw.automaticOpenEndedSetConfirmed = true
        let parsed = WatchLiveScoringEngine.parseState(raw, rules: rules, fallbackSets: raw.sets)
        XCTAssertEqual(parsed.automaticRecordMode, "AMERICANO_POINTS")
        XCTAssertEqual(parsed.automaticOpenEndedSetConfirmed, true)
        XCTAssertEqual(parsed.mode, .points)
    }

    func testAmericanoUnscoreWorks() {
        var state = WatchLiveScoringEngine.applyAutomaticRecordMode(
            state: WatchLiveScoringEngine.makeInitialState(rules: rules, initialSets: nil),
            rules: rules,
            mode: .americanoPoints
        ).state
        state = WatchLiveScoringEngine.scorePoint(state: state, side: .teamA, rules: rules).state
        XCTAssertEqual(state.sets[0].teamA, 1)
        let undone = WatchLiveScoringEngine.unscorePoint(state: state, side: .teamA, rules: rules)
        XCTAssertTrue(undone.changed)
        XCTAssertEqual(undone.state.sets[0].teamA, 0)
    }

    func testEarlyFinishBlocksUnscore() {
        var state = WatchLiveScoringEngine.applyAutomaticRecordMode(
            state: WatchLiveScoringEngine.makeInitialState(rules: rules, initialSets: nil),
            rules: rules,
            mode: .americanoPoints
        ).state
        state = WatchLiveScoringEngine.scorePoint(state: state, side: .teamA, rules: rules).state
        state.automaticEarlyFinish = true
        let blocked = WatchLiveScoringEngine.unscorePoint(state: state, side: .teamA, rules: rules)
        XCTAssertFalse(blocked.changed)
        XCTAssertFalse(WatchLiveScoringEngine.canUnscore(state: state, side: .teamA, rules: rules))
    }

    func testCanUnscoreAfterFirstAutomaticSetWhileMatchOpen() {
        var state = WatchLiveScoringEngine.applyAutomaticRecordMode(
            state: WatchLiveScoringEngine.makeInitialState(rules: rules, initialSets: nil),
            rules: rules,
            mode: .americanoPoints
        ).state
        state.sets = [
            WatchSetWrite(teamA: 24, teamB: 18, isTieBreak: false),
            WatchSetWrite(teamA: 3, teamB: 1, isTieBreak: false),
        ]
        state.activeSetIndex = 1
        // Standings may already pick a winner after set 1; live entry must stay open mid set 2.
        XCTAssertTrue(WatchComputeMatchWinner.isMatchDecidedForLiveScoring(sets: state.sets, rules: rules))
        XCTAssertFalse(WatchAutomaticFlexible.isAutomaticLiveMatchComplete(state: state, rules: rules))
        XCTAssertTrue(WatchLiveScoringEngine.canUnscore(state: state, side: .teamA, rules: rules))
        let scored = WatchLiveScoringEngine.scorePoint(state: state, side: .teamA, rules: rules)
        XCTAssertTrue(scored.changed)
        XCTAssertEqual(scored.state.sets[1].teamA, 4)
    }

    func testNormalizeDoesNotTrimAfterOneAutomaticSet() {
        var state = WatchLiveScoringEngine.applyAutomaticRecordMode(
            state: WatchLiveScoringEngine.makeInitialState(rules: rules, initialSets: nil),
            rules: rules,
            mode: .games
        ).state
        state.sets = [
            WatchSetWrite(teamA: 6, teamB: 4, isTieBreak: false),
            WatchSetWrite(teamA: 0, teamB: 0, isTieBreak: false),
        ]
        state.activeSetIndex = 0
        let normalized = WatchLiveScoringEngine.normalizeLiveSetsAfterDecision(state: state, rules: rules)
        XCTAssertEqual(normalized.sets.count, 2)
        XCTAssertTrue(
            WatchLiveScoringEngine.canUnscore(state: state, side: .teamA, rules: rules)
                || state.sets[0].teamA > 0
        )
    }

    func testApplyOptionalDeciderFormatKeepsAmericanoPointsMode() {
        var state = WatchLiveScoringEngine.applyAutomaticRecordMode(
            state: WatchLiveScoringEngine.makeInitialState(rules: rules, initialSets: nil),
            rules: rules,
            mode: .americanoPoints
        ).state
        state.sets = [
            WatchSetWrite(teamA: 24, teamB: 18, isTieBreak: false),
            WatchSetWrite(teamA: 18, teamB: 24, isTieBreak: false),
            WatchSetWrite(teamA: 0, teamB: 0, isTieBreak: false),
        ]
        state.activeSetIndex = 2
        XCTAssertTrue(WatchLiveScoringEngine.optionalDeciderChoicePending(state: state, rules: rules))
        let stb = WatchLiveScoringEngine.applyOptionalDeciderFormat(
            state: state,
            rules: rules,
            format: "SUPER_TIEBREAK"
        )
        XCTAssertTrue(stb.changed)
        XCTAssertEqual(stb.state.mode, .points)
        XCTAssertTrue(stb.state.sets[2].isTieBreak)
        XCTAssertEqual(stb.state.optionalDeciderFormat, "SUPER_TIEBREAK")
    }

    func testRegularAutomaticDeciderCompletesInEitherRecordMode() {
        var games = WatchLiveScoringEngine.applyAutomaticRecordMode(
            state: WatchLiveScoringEngine.makeInitialState(rules: rules, initialSets: nil),
            rules: rules,
            mode: .games
        ).state
        games.sets = [
            WatchSetWrite(teamA: 6, teamB: 4, isTieBreak: false),
            WatchSetWrite(teamA: 4, teamB: 6, isTieBreak: false),
            WatchSetWrite(teamA: 0, teamB: 0, isTieBreak: false),
        ]
        games.activeSetIndex = 2
        games = WatchLiveScoringEngine.applyOptionalDeciderFormat(
            state: games,
            rules: rules,
            format: "REGULAR_SET"
        ).state
        XCTAssertEqual(games.mode, .classic)
        XCTAssertFalse(games.sets[2].isTieBreak)
        games.sets[2] = WatchSetWrite(teamA: 6, teamB: 4, isTieBreak: false)
        XCTAssertTrue(WatchAutomaticFlexible.isAutomaticLiveMatchComplete(state: games, rules: rules))

        var points = WatchLiveScoringEngine.applyAutomaticRecordMode(
            state: WatchLiveScoringEngine.makeInitialState(rules: rules, initialSets: nil),
            rules: rules,
            mode: .americanoPoints
        ).state
        points.sets = [
            WatchSetWrite(teamA: 24, teamB: 18, isTieBreak: false),
            WatchSetWrite(teamA: 18, teamB: 24, isTieBreak: false),
            WatchSetWrite(teamA: 0, teamB: 0, isTieBreak: false),
        ]
        points.activeSetIndex = 2
        points = WatchLiveScoringEngine.applyOptionalDeciderFormat(
            state: points,
            rules: rules,
            format: "REGULAR_SET"
        ).state
        XCTAssertEqual(points.mode, .points)
        XCTAssertFalse(points.sets[2].isTieBreak)
        points.sets[2] = WatchSetWrite(teamA: 7, teamB: 5, isTieBreak: false)
        XCTAssertFalse(WatchAutomaticFlexible.isAutomaticLiveMatchComplete(state: points, rules: rules))
        points = WatchLiveScoringEngine.applyAutomaticOpenEndedSetConfirm(
            state: points,
            rules: rules
        ).state
        XCTAssertTrue(WatchAutomaticFlexible.isAutomaticLiveMatchComplete(state: points, rules: rules))
    }

    func testCompleteAutomaticMatchRejectsFurtherScoring() {
        var state = WatchLiveScoringEngine.applyAutomaticRecordMode(
            state: WatchLiveScoringEngine.makeInitialState(rules: rules, initialSets: nil),
            rules: rules,
            mode: .games
        ).state
        state.sets = [
            WatchSetWrite(teamA: 6, teamB: 4, isTieBreak: false),
            WatchSetWrite(teamA: 6, teamB: 3, isTieBreak: false),
        ]
        state.activeSetIndex = 1

        XCTAssertTrue(WatchAutomaticFlexible.isAutomaticLiveMatchComplete(state: state, rules: rules))
        XCTAssertFalse(WatchLiveScoringEngine.scorePoint(state: state, side: .teamA, rules: rules).changed)
        XCTAssertFalse(WatchLiveScoringEngine.unscorePoint(state: state, side: .teamA, rules: rules).changed)
    }

    func testFreshMatchUsesServerBaselineRevisionZero() {
        XCTAssertEqual(
            MatchScoringViewModel.initialLiveScoringRevision(hasSupportedEnvelope: false),
            0
        )
        XCTAssertEqual(
            MatchScoringViewModel.initialLiveScoringRevision(hasSupportedEnvelope: true),
            -1
        )
    }

    func testCzechAutomaticChoicesAreLocalized() {
        XCTAssertEqual(WatchCopy.automaticRecordModeTitle("cs"), "Jak zapisovat skóre?")
        XCTAssertEqual(WatchCopy.automaticContinueCta("cs"), "Další set")
        XCTAssertEqual(WatchCopy.automaticEndCta("cs"), "Ukončit zápas")
        XCTAssertEqual(WatchCopy.automaticDeciderPointsChoice("cs"), "Další bodový set")
        XCTAssertEqual(WatchCopy.superTieBreakChoice("cs"), "Super tie-break (do 10, rozdíl 2)")
    }
}
