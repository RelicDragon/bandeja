import XCTest
@testable import BandejaWatch_Watch_App

@MainActor
final class WatchResultsRoundBuilderTests: XCTestCase {
    func testTwoPlayingPpm2BuildsOneMatch() throws {
        let game = try WatchTestFixtures.decodeGame(
            WatchTestFixtures.baseGame(
                sport: "TENNIS",
                playersPerMatch: 2,
                maxParticipants: 2,
                participantIds: ["p0", "p1"]
            )
        )
        let round = try WatchResultsRoundBuilder.firstRound(for: game)
        XCTAssertEqual(round.matches.count, 1)
        XCTAssertEqual(round.matches[0].teamA, ["p0"])
        XCTAssertEqual(round.matches[0].teamB, ["p1"])
    }

    func testFourPlayingPpm4BuildsThreeMatches() throws {
        let game = try WatchTestFixtures.decodeGame(
            WatchTestFixtures.baseGame(
                sport: "PADEL",
                playersPerMatch: 4,
                maxParticipants: 4,
                participantIds: ["p0", "p1", "p2", "p3"]
            )
        )
        let round = try WatchResultsRoundBuilder.firstRound(for: game)
        XCTAssertEqual(round.matches.count, 3)
        XCTAssertEqual(round.matches[0].teamA, ["p0", "p1"])
        XCTAssertEqual(round.matches[0].teamB, ["p2", "p3"])
    }

    func testFixedTeamsSinglesOnePerSide() throws {
        let fixedTeams = """
        [
          {"teamNumber":1,"players":[{"userId":"a"}]},
          {"teamNumber":2,"players":[{"userId":"b"}]}
        ]
        """
        let game = try WatchTestFixtures.decodeGame(
            WatchTestFixtures.baseGame(
                sport: "TENNIS",
                playersPerMatch: 2,
                maxParticipants: 2,
                hasFixedTeams: true,
                fixedTeamsJSON: fixedTeams,
                participantIds: ["a", "b"]
            )
        )
        let round = try WatchResultsRoundBuilder.firstRound(for: game)
        XCTAssertEqual(round.matches.count, 1)
        XCTAssertEqual(round.matches[0].teamA, ["a"])
        XCTAssertEqual(round.matches[0].teamB, ["b"])
    }

    func testFourPlayingPpm2Rejected() throws {
        let game = try WatchTestFixtures.decodeGame(
            WatchTestFixtures.baseGame(
                sport: "TENNIS",
                playersPerMatch: 2,
                maxParticipants: 4,
                participantIds: ["p0", "p1", "p2", "p3"]
            )
        )
        XCTAssertThrowsError(try WatchResultsRoundBuilder.firstRound(for: game)) { error in
            XCTAssertEqual(error as? WatchResultsStartError, .unsupportedMatchGeneration)
        }
        XCTAssertFalse(WatchResultsRoundBuilder.canBuildFirstRound(for: game))
    }

    func testInvalidPlayerCountRejected() throws {
        let game = try WatchTestFixtures.decodeGame(
            WatchTestFixtures.baseGame(
                sport: "PADEL",
                playersPerMatch: 4,
                maxParticipants: 4,
                participantIds: ["a", "b", "c"]
            )
        )
        XCTAssertThrowsError(try WatchResultsRoundBuilder.firstRound(for: game)) { error in
            XCTAssertEqual(error as? WatchResultsStartError, .invalidPlayerCount)
        }
    }
}
