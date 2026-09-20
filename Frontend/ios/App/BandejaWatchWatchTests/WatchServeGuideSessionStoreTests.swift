import XCTest
@testable import BandejaWatch_Watch_App

@MainActor
final class WatchServeGuideSessionStoreTests: XCTestCase {
    private var suiteName: String!
    private var suite: UserDefaults!

    override func setUp() {
        super.setUp()
        suiteName = "bandeja.tests.serveGuide.\(UUID().uuidString)"
        suite = UserDefaults(suiteName: suiteName)
        suite.removePersistentDomain(forName: suiteName)
    }

    override func tearDown() {
        suite.removePersistentDomain(forName: suiteName)
        suite = nil
        suiteName = nil
        super.tearDown()
    }

    func testRoundTripAndPruneAfterFourteenDays() {
        var now = Date(timeIntervalSince1970: 1_800_000_000)
        let store = WatchServeGuideSessionStore(suite: suite, now: { now })
        TestRetain.keep(store)

        var record = WatchServeGuideSessionRecord.empty
        record.skipped = true
        store.save(gameId: "g1", matchId: "m1", record: record)
        XCTAssertEqual(store.load(gameId: "g1", matchId: "m1")?.skipped, true)
        XCTAssertEqual(store.storedEntryCount, 1)

        now = now.addingTimeInterval(WatchServeGuideSessionStore.maxAge + 60)
        store.save(gameId: "g2", matchId: "m2", record: .empty)

        XCTAssertNil(store.load(gameId: "g1", matchId: "m1"), "entry older than 14 days is pruned on write")
        XCTAssertNotNil(store.load(gameId: "g2", matchId: "m2"))
        XCTAssertEqual(store.storedEntryCount, 1)
    }

    func testLegacyRecordWithoutTimestampStillLoadsAndMigratesHiddenFlag() {
        let store = WatchServeGuideSessionStore(suite: suite)
        TestRetain.keep(store)
        let legacy = """
        {"skipped":false,"hiddenForMatch":true,"showedFirstServeCoachToast":false}
        """
        suite.set(Data(legacy.utf8), forKey: "bandeja.watch.serveGuide.g1.m1")

        let loaded = store.load(gameId: "g1", matchId: "m1")
        XCTAssertEqual(loaded?.skipped, true)

        // Re-saved in the timestamped envelope, so it ages out later.
        let raw = suite.data(forKey: "bandeja.watch.serveGuide.g1.m1")
            .flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        XCTAssertNotNil(raw?["savedAt"])
        XCTAssertEqual(store.load(gameId: "g1", matchId: "m1")?.skipped, true)
    }
}
