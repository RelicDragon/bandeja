import XCTest
@testable import BandejaWatch_Watch_App

@MainActor
final class WatchMatchFormatTests: XCTestCase {
    func testSingles2Roster() throws {
        let game = try WatchTestFixtures.decodeGame(
            WatchTestFixtures.baseGame(
                sport: "PADEL",
                playersPerMatch: 2,
                maxParticipants: 2,
                participantIds: ["a", "b"]
            )
        )
        XCTAssertEqual(WatchMatchFormat.playersPerMatch(of: game), 2)
        XCTAssertEqual(WatchMatchFormat.playersPerTeam(of: game), 1)
        XCTAssertEqual(WatchMatchFormat.maxPlayersPerTeam(for: game, participantCount: 2), 1)
    }

    func testDoubles4Roster() throws {
        let game = try WatchTestFixtures.decodeGame(
            WatchTestFixtures.baseGame(
                sport: "PADEL",
                playersPerMatch: 4,
                maxParticipants: 4,
                participantIds: ["a", "b", "c", "d"]
            )
        )
        XCTAssertEqual(WatchMatchFormat.playersPerMatch(of: game), 4)
        XCTAssertEqual(WatchMatchFormat.playersPerTeam(of: game), 2)
        XCTAssertEqual(WatchMatchFormat.maxPlayersPerTeam(for: game, participantCount: 4), 2)
    }

    func testEightPlayerSinglesRotation() throws {
        let game = try WatchTestFixtures.decodeGame(
            WatchTestFixtures.baseGame(
                sport: "TENNIS",
                playersPerMatch: 2,
                maxParticipants: 8,
                participantIds: ["a", "b", "c", "d", "e", "f", "g", "h"]
            )
        )
        XCTAssertEqual(WatchMatchFormat.playersPerMatch(of: game), 2)
        XCTAssertEqual(WatchMatchFormat.playersPerTeam(of: game), 1)
        XCTAssertEqual(WatchMatchFormat.maxPlayersPerTeam(for: game, participantCount: 8), 1)
    }

    func testPadelSportDefaultDoubles() throws {
        let game = try WatchTestFixtures.decodeGame(
            WatchTestFixtures.baseGame(
                sport: "PADEL",
                maxParticipants: 4,
                participantIds: ["a", "b", "c", "d"]
            )
        )
        XCTAssertEqual(WatchMatchFormat.playersPerMatch(of: game), 4)
        XCTAssertEqual(WatchMatchFormat.playersPerTeam(of: game), 2)
        XCTAssertEqual(WatchMatchFormat.maxPlayersPerTeam(for: game, participantCount: 4), 2)
    }

    func testFallsBackToRosterSize2ForSinglesDisplayCap() throws {
        let game = try WatchTestFixtures.decodeGame(
            WatchTestFixtures.baseGame(sport: "PADEL", participantIds: ["a", "b"])
        )
        XCTAssertEqual(WatchMatchFormat.maxPlayersPerTeam(for: game, participantCount: 2), 1)
        XCTAssertEqual(WatchMatchFormat.maxPlayersPerTeam(for: game, participantCount: 4), 2)
    }

    func testIsPresetResultsRoster() {
        XCTAssertTrue(WatchMatchFormat.isPresetResultsRoster(playingCount: 2))
        XCTAssertTrue(WatchMatchFormat.isPresetResultsRoster(playingCount: 4))
        XCTAssertFalse(WatchMatchFormat.isPresetResultsRoster(playingCount: 3))
        XCTAssertFalse(WatchMatchFormat.isPresetResultsRoster(playingCount: 8))
    }

    func testCapUserIds() {
        XCTAssertEqual(WatchMatchFormat.capUserIds(["a", "b", "c"], max: 2), ["a", "b"])
        XCTAssertEqual(WatchMatchFormat.capUserIds(["a"], max: 2), ["a"])
    }
}
