import XCTest
@testable import BandejaWatch_Watch_App

@MainActor
final class WatchMatchTimerRelayStoreTests: XCTestCase {
    private func snapshot(status: String, elapsedMs: Int = 1000, serverNow: String = "2026-09-20T10:00:00.000Z") -> WatchMatchTimerSnapshot {
        WatchMatchTimerSnapshot(
            status: status,
            startedAt: "2026-09-20T09:59:59.000Z",
            pausedAt: nil,
            elapsedMs: elapsedMs,
            capMinutes: 90,
            serverNow: serverNow,
            expiresAt: nil,
            capJustNotified: nil
        )
    }

    func testTypedIngestPublishesMessageAndBumpsTick() {
        let store = WatchMatchTimerRelayStore.shared
        let before = store.tick
        let s = snapshot(status: "PAUSED")
        let t0 = Date()
        store.ingest(gameId: "g1", matchId: "m1", snapshot: s)

        XCTAssertEqual(store.tick, before + 1)
        XCTAssertEqual(store.lastMessage?.gameId, "g1")
        XCTAssertEqual(store.lastMessage?.matchId, "m1")
        XCTAssertEqual(store.lastMessage?.snapshot, s)
        XCTAssertGreaterThanOrEqual(store.lastMessage?.receivedAt ?? .distantPast, t0)
        XCTAssertEqual(store.lastStatus(gameId: "g1", matchId: "m1"), "PAUSED")
        XCTAssertNil(store.lastStatus(gameId: "g1", matchId: "other"))
    }

    func testDictionaryIngestMatchesTypedIngest() throws {
        let store = WatchMatchTimerRelayStore.shared
        let s = snapshot(status: "RUNNING", elapsedMs: 4200)
        let dict: [String: Any] = [
            "gameId": "g2",
            "matchId": "m2",
            "snapshot": try XCTUnwrap(s.asDictionary()),
        ]
        store.ingest(dict)
        XCTAssertEqual(store.lastMessage?.snapshot, s)
        XCTAssertEqual(store.lastStatus(gameId: "g2", matchId: "m2"), "RUNNING")
    }

    func testDictionaryIngestIgnoresMalformedPayload() {
        let store = WatchMatchTimerRelayStore.shared
        let before = store.tick
        store.ingest(["matchId": "only"])
        XCTAssertEqual(store.tick, before)
    }
}
