import BandejaWatchShared
import XCTest

final class BandejaWatchSharedTests: XCTestCase {
    private var suiteName: String!
    private var suite: UserDefaults!

    override func setUp() {
        super.setUp()
        suiteName = "group.test.bandeja.\(UUID().uuidString)"
        suite = UserDefaults(suiteName: suiteName)
        suite.removePersistentDomain(forName: suiteName)
    }

    override func tearDown() {
        suite.removePersistentDomain(forName: suiteName)
        suite = nil
        suiteName = nil
        super.tearDown()
    }

    func testNextGamesCacheRoundTrip() {
        let game = CachedNextGame(
            id: "g1",
            title: "Morning padel",
            clubName: "Club A",
            startTime: Date(timeIntervalSince1970: 1_700_000_000),
            status: "SCHEDULED",
            resultsStatus: "NONE",
            gameType: "MATCH",
            participantCount: 2,
            maxParticipants: 4,
            sport: "PADEL",
            playersPerMatch: 4
        )
        NextGamesCache.write([game], suite: suite)
        let readBack = NextGamesCache.read(suite: suite)
        XCTAssertEqual(readBack.count, 1)
        XCTAssertEqual(readBack[0].id, "g1")
        XCTAssertEqual(readBack[0].clubName, "Club A")
        NextGamesCache.clear(suite: suite)
        XCTAssertTrue(NextGamesCache.read(suite: suite).isEmpty)
    }

    func testLiveActiveSnapshotRoundTrip() {
        let payload = LiveActiveSnapshotPayload(
            gameId: "g1",
            matchId: "m1",
            titleLine: "Live match",
            scoreLine: "6-4",
            sport: "PADEL"
        )
        LiveActiveSnapshotStore.write(payload, suite: suite)
        let readBack = LiveActiveSnapshotStore.read(suite: suite)
        XCTAssertEqual(readBack?.gameId, "g1")
        XCTAssertEqual(readBack?.scoreLine, "6-4")
        LiveActiveSnapshotStore.clear(suite: suite)
        XCTAssertNil(LiveActiveSnapshotStore.read(suite: suite))
    }

    func testLiveScoringRelayPayloadEncodeDecode() {
        let liveScoring: [String: Any] = ["revision": 3, "state": "playing"]
        let payload = LiveScoringRelayPayload(
            gameId: "g1",
            matchId: "m1",
            revision: 3,
            liveScoring: liveScoring
        )
        let encoded = payload.encode()
        let decoded = LiveScoringRelayPayload(decode: encoded)
        XCTAssertEqual(decoded?.gameId, "g1")
        XCTAssertEqual(decoded?.matchId, "m1")
        XCTAssertEqual(decoded?.revision, 3)
        XCTAssertEqual(decoded?.liveScoring?["state"] as? String, "playing")
    }

    func testLiveScoringRelayPayloadExplicitClear() {
        let payload = LiveScoringRelayPayload(
            gameId: "g1",
            matchId: "m1",
            revision: 0,
            liveScoring: nil,
            isExplicitClear: true
        )
        let encoded = payload.encode()
        let decoded = LiveScoringRelayPayload(decode: encoded)
        XCTAssertTrue(decoded?.isExplicitClear == true)
        XCTAssertNil(decoded?.liveScoring)
    }

    func testMatchTimerRelayPayloadEncodeDecode() {
        let snapshot: [String: Any] = ["serverNow": "2026-01-01T12:00:00Z", "running": true]
        let payload = MatchTimerRelayPayload(gameId: "g1", matchId: "m1", snapshot: snapshot)
        let encoded = payload.encode()
        let decoded = MatchTimerRelayPayload(decode: encoded)
        XCTAssertEqual(decoded?.gameId, "g1")
        XCTAssertEqual(decoded?.snapshot["running"] as? Bool, true)
    }

    func testScoreUpdatedPayloadEncodeDecode() {
        let payload = ScoreUpdatedPayload(gameId: "g1", matchId: "m1", revision: 7)
        let encoded = payload.encode()
        let decoded = ScoreUpdatedPayload(decode: encoded)
        XCTAssertEqual(decoded?.revision, 7)
        XCTAssertEqual(decoded?.notificationUserInfo["gameId"] as? String, "g1")
    }

    func testWatchAuthSyncPayloadEncodeDecode() {
        let payload = WatchAuthSyncPayload(
            token: "jwt-token",
            language: "es",
            weekStart: "monday",
            defaultCurrency: "EUR",
            timeFormat: "24h",
            prefsVersion: 1_700_000_000
        )
        let encoded = payload.encode()
        let decoded = WatchAuthSyncPayload(decode: encoded)
        XCTAssertEqual(decoded?.token, "jwt-token")
        XCTAssertEqual(decoded?.language, "es")
        XCTAssertEqual(decoded?.defaultCurrency, "EUR")
    }

    func testWatchAuthSyncLogoutPayload() {
        let encoded = WatchAuthSyncPayload.logoutPayload()
        let decoded = WatchAuthSyncPayload(decode: encoded)
        XCTAssertTrue(decoded?.isLogout == true)
    }
}
