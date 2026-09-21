import XCTest
@testable import BandejaWatch_Watch_App

/// PRD 346 — the watch's half of attendance. Confirmation is a courtesy
/// signal: these tests pin the prompt rule and prove the payload parsing keeps
/// the viewer's answer separate from anything that could move a seat.
@MainActor
final class WatchAttendanceTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func hoursFromNow(_ hours: Double) -> Date {
        now.addingTimeInterval(hours * 3600)
    }

    // MARK: - The prompt rule

    func testAsksInsideTheWindow() {
        XCTAssertTrue(
            WatchAttendance.needsAnswer(
                attendance: "UNANSWERED",
                status: "ANNOUNCED",
                startTime: hoursFromNow(3),
                now: now
            )
        )
        XCTAssertTrue(
            WatchAttendance.needsAnswer(
                attendance: "UNANSWERED",
                status: "ANNOUNCED",
                startTime: hoursFromNow(24),
                now: now
            ),
            "exactly 24 h out is inside the window"
        )
    }

    func testStaysQuietOutsideTheWindow() {
        XCTAssertFalse(
            WatchAttendance.needsAnswer(
                attendance: "UNANSWERED",
                status: "ANNOUNCED",
                startTime: hoursFromNow(25),
                now: now
            )
        )
    }

    func testAskesNothingOnceTheGameHasStarted() {
        // The backend closes answers at kick-off, so a game whose start has
        // passed must not show a button that would only fail.
        XCTAssertFalse(
            WatchAttendance.needsAnswer(
                attendance: "UNANSWERED",
                status: "ANNOUNCED",
                startTime: hoursFromNow(-0.5),
                now: now
            )
        )
        XCTAssertFalse(
            WatchAttendance.needsAnswer(
                attendance: "UNANSWERED",
                status: "ANNOUNCED",
                startTime: now,
                now: now
            )
        )
    }

    func testDoesNotAskTwice() {
        for answered in ["CONFIRMED", "UNSURE"] {
            XCTAssertFalse(
                WatchAttendance.needsAnswer(
                    attendance: answered,
                    status: "ANNOUNCED",
                    startTime: hoursFromNow(2),
                    now: now
                ),
                "\(answered) has already answered"
            )
        }
    }

    func testDoesNotAskSomebodyTheGameIsNotAsking() {
        // `nil` is "not a PLAYING participant" — a spectator is never asked.
        XCTAssertFalse(
            WatchAttendance.needsAnswer(
                attendance: nil,
                status: "ANNOUNCED",
                startTime: hoursFromNow(2),
                now: now
            )
        )
    }

    func testOnlyAnnouncedGamesAsk() {
        for status in ["STARTED", "FINISHED", "ARCHIVED"] {
            XCTAssertFalse(
                WatchAttendance.needsAnswer(
                    attendance: "UNANSWERED",
                    status: status,
                    startTime: hoursFromNow(2),
                    now: now
                ),
                "\(status) must not ask"
            )
        }
    }

    // MARK: - Payloads

    func testDecodesTheAttendanceEndpoint() throws {
        let json = """
        {"viewerAttendance":"UNANSWERED","answersOpen":true,"confirmedCount":2,
         "unsureCount":1,"unansweredCount":1,"playingCount":4,"noShowWindowOpen":false}
        """
        let attendance = try JSONDecoder().decode(WatchGameAttendance.self, from: Data(json.utf8))

        XCTAssertEqual(attendance.viewerAttendance, "UNANSWERED")
        XCTAssertTrue(attendance.answersOpen)
        XCTAssertEqual(attendance.confirmedCount, 2)
        XCTAssertEqual(attendance.playingCount, 4)
        XCTAssertTrue(attendance.canAnswer)
        XCTAssertFalse(attendance.hasAnswered)
    }

    func testAClosedGameOffersNothing() throws {
        let json = """
        {"viewerAttendance":"CONFIRMED","answersOpen":false,"confirmedCount":4,"playingCount":4}
        """
        let attendance = try JSONDecoder().decode(WatchGameAttendance.self, from: Data(json.utf8))

        XCTAssertFalse(attendance.canAnswer)
        XCTAssertTrue(attendance.hasAnswered)
    }

    func testANonParticipantIsNotAsked() throws {
        let json = """
        {"viewerAttendance":null,"answersOpen":true,"confirmedCount":3,"playingCount":4}
        """
        let attendance = try JSONDecoder().decode(WatchGameAttendance.self, from: Data(json.utf8))

        XCTAssertNil(attendance.viewerAttendance)
        XCTAssertFalse(attendance.canAnswer)
    }

    /// The answer endpoint returns counts but not the window, so merging must
    /// keep `answersOpen` — otherwise answering once hides the Change button.
    func testMergingAnAnswerKeepsTheWindowOpen() throws {
        let before = WatchGameAttendance(
            summary: WatchAttendanceSummary(
                viewerAttendance: "UNANSWERED",
                confirmedCount: 1,
                playingCount: 4
            ),
            answersOpen: true
        )
        let json = """
        {"attendance":"CONFIRMED","summary":{"viewerAttendance":"CONFIRMED","confirmedCount":2,
         "unsureCount":0,"unansweredCount":2,"playingCount":4}}
        """
        let response = try JSONDecoder().decode(
            WatchAttendanceAnswerResponse.self,
            from: Data(json.utf8)
        )

        let after = before.merging(response)
        XCTAssertEqual(after.viewerAttendance, "CONFIRMED")
        XCTAssertEqual(after.confirmedCount, 2)
        XCTAssertTrue(after.answersOpen)
        XCTAssertTrue(after.canAnswer, "the player can still change their mind")
    }

    // MARK: - The game payloads

    func testMyGamesCarriesTheViewersAnswer() throws {
        let game = try WatchTestFixtures.decodeGame(
            WatchTestFixtures.gameWithAttendance(viewerAttendance: "UNANSWERED")
        )
        XCTAssertEqual(game.attendanceSummary?.viewerAttendance, "UNANSWERED")
        XCTAssertEqual(game.attendanceSummary?.confirmedCount, 1)
        XCTAssertEqual(game.attendanceSummary?.playingCount, 4)
    }

    func testAGamePayloadWithoutAttendanceStillDecodes() throws {
        let game = try WatchTestFixtures.decodeGame(
            WatchTestFixtures.baseGame(participantIds: ["a", "b"])
        )
        XCTAssertNil(game.attendanceSummary)
        XCTAssertFalse(game.needsAttendanceAnswer)
    }

    func testTheRowMarkerFollowsTheSameRule() throws {
        let soon = ISO8601DateFormatter().string(from: Date().addingTimeInterval(3 * 3600))
        let asking = try WatchTestFixtures.decodeGame(
            WatchTestFixtures.gameWithAttendance(
                viewerAttendance: "UNANSWERED",
                status: "ANNOUNCED",
                startTime: soon
            )
        )
        XCTAssertTrue(asking.needsAttendanceAnswer)

        let answered = try WatchTestFixtures.decodeGame(
            WatchTestFixtures.gameWithAttendance(
                viewerAttendance: "CONFIRMED",
                status: "ANNOUNCED",
                startTime: soon
            )
        )
        XCTAssertFalse(answered.needsAttendanceAnswer)
    }

    /// The seat count comes from the roster, never from attendance: a game
    /// where nobody has confirmed still shows all four players.
    func testAttendanceNeverChangesTheRosterCount() throws {
        let game = try WatchTestFixtures.decodeGame(
            WatchTestFixtures.gameWithAttendance(viewerAttendance: "UNANSWERED")
        )
        XCTAssertEqual(game.participantCount, 4)
        XCTAssertEqual(game.playingParticipants.count, 4)
    }
}
