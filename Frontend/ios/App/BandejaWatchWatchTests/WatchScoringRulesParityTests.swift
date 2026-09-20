import XCTest
@testable import BandejaWatch_Watch_App

/// Rule-resolution parity with `Backend/src/services/results/liveScoringEngine/rulebook.ts`,
/// `shared/sportPresetMeta.ts`, `shared/gameFormat/goldenPoint.ts` and `shared/createTemplates.ts`.
@MainActor
final class WatchScoringRulesParityTests: XCTestCase {
    private func game(
        sport: String? = "PADEL",
        preset: String?,
        fixedNumberOfSets: Int? = nil,
        ballsInGames: Bool? = nil,
        winnerOfMatch: String? = nil,
        deucesBeforeGoldenPoint: Int? = nil,
        matchTimerEnabled: Bool? = nil,
        matchTimedCapMinutes: Int? = nil,
        metadataJSON: String? = nil
    ) throws -> WatchGame {
        var fields: [String] = [
            "\"id\":\"g1\"",
            "\"gameType\":\"CLASSIC\"",
            "\"entityType\":\"GAME\"",
            "\"status\":\"STARTED\"",
            "\"resultsStatus\":\"IN_PROGRESS\"",
            "\"startTime\":\"2026-05-29T12:00:00.000Z\"",
            "\"participants\":[]",
        ]
        if let sport { fields.append("\"sport\":\"\(sport)\"") }
        if let preset { fields.append("\"scoringPreset\":\"\(preset)\"") }
        if let fixedNumberOfSets { fields.append("\"fixedNumberOfSets\":\(fixedNumberOfSets)") }
        if let ballsInGames { fields.append("\"ballsInGames\":\(ballsInGames)") }
        if let winnerOfMatch { fields.append("\"winnerOfMatch\":\"\(winnerOfMatch)\"") }
        if let deucesBeforeGoldenPoint { fields.append("\"deucesBeforeGoldenPoint\":\(deucesBeforeGoldenPoint)") }
        if let matchTimerEnabled { fields.append("\"matchTimerEnabled\":\(matchTimerEnabled)") }
        if let matchTimedCapMinutes { fields.append("\"matchTimedCapMinutes\":\(matchTimedCapMinutes)") }
        if let metadataJSON { fields.append("\"metadata\":\(metadataJSON)") }
        return try WatchTestFixtures.decodeGame("{\(fields.joined(separator: ","))}")
    }

    // MARK: strictValidation (sportPresetMeta.ts)

    func testClassicAutomaticRelaxedOnlyForPadel() throws {
        let padel = try WatchScoringRulebook.rules(for: game(sport: "PADEL", preset: "CLASSIC_AUTOMATIC"))
        XCTAssertEqual(padel.strictValidation, .classicAutomaticRelaxed)
        XCTAssertTrue(padel.isClassicAutomaticRelaxed)
        XCTAssertTrue(padel.allowIncompleteRegularSetGames)
        XCTAssertTrue(padel.allowRemoveSet)

        let tennis = try WatchScoringRulebook.rules(for: game(sport: "TENNIS", preset: "CLASSIC_AUTOMATIC"))
        XCTAssertEqual(tennis.strictValidation, .none)
        XCTAssertFalse(tennis.isClassicAutomaticRelaxed)
        XCTAssertFalse(tennis.allowIncompleteRegularSetGames)
        XCTAssertTrue(tennis.allowRemoveSet, "skeleton allowRemoveSet is sport-independent")
    }

    func testClassicTimedRelaxedBySport() throws {
        let tennisSingle = try WatchScoringRulebook.rules(for: game(sport: "TENNIS", preset: "CLASSIC_SINGLE_SET"))
        XCTAssertEqual(tennisSingle.strictValidation, .classicTimedRelaxed)
        XCTAssertTrue(tennisSingle.allowIncompleteRegularSetGames)

        let padelSingle = try WatchScoringRulebook.rules(for: game(sport: "PADEL", preset: "CLASSIC_SINGLE_SET"))
        XCTAssertEqual(padelSingle.strictValidation, .none)
        XCTAssertFalse(padelSingle.allowIncompleteRegularSetGames)

        let padelTimed = try WatchScoringRulebook.rules(for: game(sport: "PADEL", preset: "CLASSIC_TIMED"))
        XCTAssertEqual(padelTimed.strictValidation, .classicTimedRelaxed)
        XCTAssertTrue(padelTimed.allowIncompleteRegularSetGames)
    }

    func testRallyStrictIdsBySport() throws {
        XCTAssertEqual(
            try WatchScoringRulebook.rules(for: game(sport: "BADMINTON", preset: "BEST_OF_3_21")).strictValidation,
            .bwf21
        )
        XCTAssertEqual(
            try WatchScoringRulebook.rules(for: game(sport: "BADMINTON", preset: "BEST_OF_3_15")).strictValidation,
            .bwf15
        )
        XCTAssertEqual(
            try WatchScoringRulebook.rules(for: game(sport: "BADMINTON", preset: "SINGLE_GAME_21")).strictValidation,
            .none
        )
        XCTAssertEqual(
            try WatchScoringRulebook.rules(for: game(sport: "PICKLEBALL", preset: "BEST_OF_3_11")).strictValidation,
            .pickleballRally11
        )
        XCTAssertEqual(
            try WatchScoringRulebook.rules(for: game(sport: "TABLE_TENNIS", preset: "BEST_OF_3_11")).strictValidation,
            .none
        )
        XCTAssertEqual(
            try WatchScoringRulebook.rules(for: game(sport: nil, preset: "CLASSIC_AUTOMATIC")).strictValidation,
            .none,
            "missing sport → NONE (getStrictValidationForPreset)"
        )
    }

    // MARK: matchTimerEnabled (rulebook.ts `Boolean(game.matchTimerEnabled)`)

    func testMatchTimerFlagRelaxesRegularSetsWithoutCap() throws {
        let g = try game(sport: "PADEL", preset: "CLASSIC_BEST_OF_3", matchTimerEnabled: true, matchTimedCapMinutes: nil)
        XCTAssertFalse(g.isMatchTimerEnabled, "UI helper still needs a cap (web isGameMatchTimerEnabled)")
        XCTAssertTrue(WatchScoringRulebook.rules(for: g).allowIncompleteRegularSetGames)
    }

    // MARK: golden point clamp (goldenPoint.ts)

    func testDeucesBeforeGoldenPointClamp() throws {
        XCTAssertNil(WatchScoringRules.clampDeucesBeforeGoldenPoint(nil))
        XCTAssertEqual(WatchScoringRules.clampDeucesBeforeGoldenPoint(0), 0)
        XCTAssertEqual(WatchScoringRules.clampDeucesBeforeGoldenPoint(4), 4)
        XCTAssertNil(WatchScoringRules.clampDeucesBeforeGoldenPoint(5))
        XCTAssertNil(WatchScoringRules.clampDeucesBeforeGoldenPoint(-1))

        let tooHigh = try WatchScoringRulebook.rules(for: game(preset: "CLASSIC_BEST_OF_3", deucesBeforeGoldenPoint: 9))
        XCTAssertNil(tooHigh.deucesBeforeGoldenPoint)
        let fast4 = try WatchScoringRulebook.rules(for: game(sport: "TENNIS", preset: "CLASSIC_FAST4"))
        XCTAssertEqual(fast4.deucesBeforeGoldenPoint, 0)
        let points = try WatchScoringRulebook.rules(for: game(preset: "POINTS_24", deucesBeforeGoldenPoint: 2))
        XCTAssertNil(points.deucesBeforeGoldenPoint, "golden point only applies to classic BY_SETS")
    }

    // MARK: derived rules (rulebook.ts deriveFromGame)

    func testDerivedSingleSetIsProSet() throws {
        let g = try game(sport: "PADEL", preset: nil, fixedNumberOfSets: 1, ballsInGames: true, winnerOfMatch: "BY_SETS")
        let r = WatchScoringRulebook.rules(for: g)
        XCTAssertEqual(r.gamesPerSet, 9)
        XCTAssertEqual(r.tieBreakGameAtGames, 8)
        XCTAssertEqual(r.fixedNumberOfSets, 1)
        XCTAssertEqual(r.strictValidation, .none)
    }

    // MARK: officiating (createTemplates.ts / officiatingLevel.ts)

    func testOfficiatingTiersFromCreateTemplates() throws {
        XCTAssertEqual(
            try game(sport: "TENNIS", preset: "CLASSIC_FAST4").resolvedOfficiatingLevel, .none,
            "CLASSIC_FAST4 is social"
        )
        XCTAssertEqual(try game(sport: "TENNIS", preset: "CLASSIC_SINGLE_SET").resolvedOfficiatingLevel, .none)
        XCTAssertEqual(try game(sport: "TENNIS", preset: "CLASSIC_TIMED").resolvedOfficiatingLevel, .none)
        XCTAssertEqual(try game(sport: "BADMINTON", preset: "BEST_OF_3_15").resolvedOfficiatingLevel, .none, "tier both")
        XCTAssertEqual(try game(sport: "BADMINTON", preset: "BEST_OF_3_21").resolvedOfficiatingLevel, .strict)
        XCTAssertEqual(try game(sport: "PADEL", preset: "CLASSIC_BEST_OF_3").resolvedOfficiatingLevel, .strict)
        XCTAssertEqual(try game(sport: "PADEL", preset: "CLASSIC_AUTOMATIC").resolvedOfficiatingLevel, .strict)
        XCTAssertEqual(try game(sport: "TABLE_TENNIS", preset: "BEST_OF_5_11").resolvedOfficiatingLevel, .strict)
        XCTAssertEqual(try game(sport: "PICKLEBALL", preset: "POINTS_21").resolvedOfficiatingLevel, .hints)
        XCTAssertEqual(try game(sport: "PICKLEBALL", preset: "PAR_11").resolvedOfficiatingLevel, .hints, "inferred social")
        XCTAssertEqual(try game(sport: "PADEL", preset: "PAR_11").resolvedOfficiatingLevel, .none)
        XCTAssertEqual(try game(sport: "PADEL", preset: "CLASSIC_PRO_SET").resolvedOfficiatingLevel, .strict, "inferred match")
        XCTAssertEqual(try game(sport: "PADEL", preset: nil).resolvedOfficiatingLevel, .none, "no preset → none")
    }

    func testGameMetadataOfficiatingLevelOverridesPreset() throws {
        let hinted = try game(sport: "PADEL", preset: "CLASSIC_BEST_OF_3", metadataJSON: "{\"officiatingLevel\":\"hints\"}")
        XCTAssertEqual(hinted.metadata?.officiatingLevel, "hints")
        XCTAssertEqual(hinted.resolvedOfficiatingLevel, .hints)

        let strictSocial = try game(sport: "TENNIS", preset: "CLASSIC_FAST4", metadataJSON: "{\"officiatingLevel\":\"strict\"}")
        XCTAssertEqual(strictSocial.resolvedOfficiatingLevel, .strict)

        let bogus = try game(sport: "PADEL", preset: "CLASSIC_BEST_OF_3", metadataJSON: "{\"officiatingLevel\":\"referee\"}")
        XCTAssertEqual(bogus.resolvedOfficiatingLevel, .strict, "unknown level falls back to preset tier")

        let nullMeta = try game(sport: "PADEL", preset: "CLASSIC_BEST_OF_3", metadataJSON: "null")
        XCTAssertNil(nullMeta.metadata)
        let arrayMeta = try game(sport: "PADEL", preset: "CLASSIC_BEST_OF_3", metadataJSON: "[1,2]")
        XCTAssertNil(arrayMeta.metadata, "non-object metadata decodes leniently")
        let otherKeys = try game(sport: "PADEL", preset: "CLASSIC_BEST_OF_3", metadataJSON: "{\"liveScoring\":{\"v\":1}}")
        XCTAssertNil(otherKeys.metadata?.officiatingLevel)
        XCTAssertEqual(otherKeys.resolvedOfficiatingLevel, .strict)
    }

    // MARK: strict rally validation (strictValidation.ts)

    func testBwfCapAndPickleballStrictScores() {
        XCTAssertTrue(WatchValidateSet.validateBwfRallyGameScore(a: 30, b: 29, pointsPerGame: 21))
        XCTAssertFalse(WatchValidateSet.validateBwfRallyGameScore(a: 31, b: 29, pointsPerGame: 21))
        XCTAssertFalse(WatchValidateSet.validateBwfRallyGameScore(a: 30, b: 30, pointsPerGame: 21))
        XCTAssertTrue(WatchValidateSet.validateBwfRallyGameScore(a: 21, b: 19, pointsPerGame: 21))
        XCTAssertFalse(WatchValidateSet.validateBwfRallyGameScore(a: 21, b: 20, pointsPerGame: 21))
        XCTAssertTrue(WatchValidateSet.validateBwfRallyGameScore(a: 21, b: 20, pointsPerGame: 15), "15-point cap is 21")
        XCTAssertFalse(WatchValidateSet.validateBwfRallyGameScore(a: 22, b: 20, pointsPerGame: 15))

        XCTAssertTrue(WatchValidateSet.validatePickleballRally11Score(a: 11, b: 9))
        XCTAssertFalse(WatchValidateSet.validatePickleballRally11Score(a: 11, b: 10))
        XCTAssertTrue(WatchValidateSet.validatePickleballRally11Score(a: 12, b: 10))
        XCTAssertFalse(WatchValidateSet.validatePickleballRally11Score(a: 13, b: 10))
        XCTAssertTrue(WatchValidateSet.validatePickleballRally11Score(a: 0, b: 0))
    }

    func testBwfCapFlowsIntoLiveWinner() {
        let bwf = WatchScoringRulebook.skeleton(for: .bestOf3_21, sport: .badminton)
        let sets = [
            WatchSetWrite(teamA: 21, teamB: 15),
            WatchSetWrite(teamA: 30, teamB: 29),
        ]
        XCTAssertEqual(WatchComputeMatchWinner.computeMatchWinnerLiveScoring(sets: sets, rules: bwf), .teamA)

        let plain = WatchScoringRulebook.skeleton(for: .bestOf3_21, sport: .padel)
        XCTAssertNil(WatchComputeMatchWinner.computeMatchWinnerLiveScoring(sets: sets, rules: plain))
    }
}
