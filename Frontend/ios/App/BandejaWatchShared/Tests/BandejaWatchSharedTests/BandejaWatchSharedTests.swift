import Foundation
import BandejaWatchShared
import XCTest

final class BandejaWatchSharedTests: XCTestCase {
    private var suiteName: String!
    private var suite: UserDefaults!

    override func setUp() {
        super.setUp()
        suiteName = "group.test.bandeja.watch.\(UUID().uuidString)"
        suite = UserDefaults(suiteName: suiteName)
        suite.removePersistentDomain(forName: suiteName)
    }

    override func tearDown() {
        suite.removePersistentDomain(forName: suiteName)
        suite = nil
        suiteName = nil
        super.tearDown()
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

    func testWatchConnectivityEventNamesAreStable() {
        XCTAssertEqual(WatchConnectivityEvent.liveScoringRelay, "liveScoringRelay")
        XCTAssertEqual(WatchConnectivityEvent.matchTimerRelay, "matchTimerRelay")
        XCTAssertEqual(WatchConnectivityEvent.scoreUpdated, "scoreUpdated")
        XCTAssertEqual(WatchConnectivityEvent.logout, "logout")
    }

    func testAppGroupStorageContractsAreStable() {
        XCTAssertEqual(LiveActiveSnapshotStore.suiteName, "group.com.funified.bandeja")
        XCTAssertEqual(LiveActiveSnapshotStore.storageKey, "watchLiveActiveScoringV1")
    }

    func testLiveActiveKeyDoesNotTouchNextGamesKeys() {
        LiveActiveSnapshotStore.write(
            LiveActiveSnapshotPayload(
                gameId: "g1",
                matchId: "m1",
                titleLine: "Live",
                scoreLine: "1-0",
                sport: "PADEL"
            ),
            suite: suite
        )
        XCTAssertNotNil(suite.data(forKey: LiveActiveSnapshotStore.storageKey))
        XCTAssertNil(suite.data(forKey: "bandeja.widget.nextGames.v1"))
        XCTAssertNil(suite.object(forKey: "bandeja.widget.uiLanguage.v1"))
        XCTAssertNil(suite.object(forKey: "bandeja.widget.isAuthenticated.v1"))
    }

    func testWatchConnectivityRelayLimitThreshold() {
        XCTAssertFalse(WatchConnectivityRelayLimits.exceedsLimit(["event": "scoreUpdated", "gameId": "g", "matchId": "m"]))
        let oversized = String(repeating: "x", count: WatchConnectivityRelayLimits.payloadLimitBytes)
        XCTAssertTrue(WatchConnectivityRelayLimits.exceedsLimit(["blob": oversized]))
    }
}
