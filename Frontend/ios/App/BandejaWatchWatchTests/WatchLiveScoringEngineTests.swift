import XCTest
@testable import BandejaWatch_Watch_App

@MainActor
final class WatchLiveScoringEngineTests: XCTestCase {
    func testScorePointAdvancesClassicGame() {
        let rules = WatchScoringRulebook.skeleton(for: .classicBo3)
        var state = WatchLiveScoringEngine.makeInitialState(rules: rules, initialSets: nil)
        state.classic = WatchLiveClassicState(
            pointState: .regular(teamA: .forty, teamB: .zero),
            withinSetTieBreak: false,
            tieBreakA: 0,
            tieBreakB: 0,
            classicPointsPlayedInGame: 3
        )
        let result = WatchLiveScoringEngine.scorePoint(state: state, side: .teamA, rules: rules)
        XCTAssertTrue(result.changed)
        XCTAssertEqual(result.state.sets[0].teamA, 1)
        if case .regular(let a, let b) = result.state.classic?.pointState {
            XCTAssertEqual(a, .zero)
            XCTAssertEqual(b, .zero)
        } else {
            XCTFail("expected regular 0-0 after game")
        }
    }

    func testUnscorePointRevertsClassicPoint() {
        let rules = WatchScoringRulebook.skeleton(for: .classicBo3)
        var state = WatchLiveScoringEngine.makeInitialState(rules: rules, initialSets: nil)
        state.classic = WatchLiveClassicState(
            pointState: .regular(teamA: .thirty, teamB: .fifteen),
            withinSetTieBreak: false,
            tieBreakA: 0,
            tieBreakB: 0,
            classicPointsPlayedInGame: 2
        )
        let result = WatchLiveScoringEngine.unscorePoint(state: state, side: .teamA, rules: rules)
        XCTAssertTrue(result.changed)
        if case .regular(let a, let b) = result.state.classic?.pointState {
            XCTAssertEqual(a, .fifteen)
            XCTAssertEqual(b, .fifteen)
        } else {
            XCTFail("expected regular 15-15 after unscore")
        }
    }

    func testOptionalDeciderBlocksScoring() {
        let rules = WatchScoringRulebook.skeleton(for: .classicBo3)
        var state = WatchLiveScoringEngine.makeInitialState(
            rules: rules,
            initialSets: [
                WatchSetWrite(teamA: 6, teamB: 4, isTieBreak: false),
                WatchSetWrite(teamA: 4, teamB: 6, isTieBreak: false),
                WatchSetWrite(teamA: 0, teamB: 0, isTieBreak: false),
            ]
        )
        state.activeSetIndex = 2
        XCTAssertTrue(WatchLiveScoringEngine.optionalDeciderChoicePending(state: state, rules: rules))
        let result = WatchLiveScoringEngine.scorePoint(state: state, side: .teamA, rules: rules)
        XCTAssertFalse(result.changed)
    }
}
