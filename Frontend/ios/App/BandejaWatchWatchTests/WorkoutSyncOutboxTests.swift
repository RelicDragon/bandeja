import XCTest
@testable import BandejaWatch_Watch_App

@MainActor
final class WorkoutSyncOutboxTests: XCTestCase {
    private var suiteName: String!
    private var suite: UserDefaults!

    override func setUp() {
        super.setUp()
        suiteName = "bandeja.tests.workoutOutbox.\(UUID().uuidString)"
        suite = UserDefaults(suiteName: suiteName)
        suite.removePersistentDomain(forName: suiteName)
    }

    override func tearDown() {
        suite.removePersistentDomain(forName: suiteName)
        suite = nil
        suiteName = nil
        super.tearDown()
    }

    private func entry(gameId: String, owner: String? = nil) -> WorkoutSyncOutbox.OutboxEntry {
        WorkoutSyncOutbox.OutboxEntry(
            gameId: gameId,
            durationSeconds: 60,
            totalEnergyKcal: 12,
            avgHeartRate: 120,
            maxHeartRate: 150,
            startedAt: "2026-09-20T10:00:00.000Z",
            endedAt: "2026-09-20T10:01:00.000Z",
            source: "APPLE_WATCH",
            healthExternalId: nil,
            enqueuedAt: Date(),
            ownerUserId: owner
        )
    }

    func testEnqueueBindsEntryToCurrentUser() {
        let outbox = WorkoutSyncOutbox(suite: suite, currentUserId: { "u1" })
        TestRetain.keep(outbox)
        outbox.enqueue(entry(gameId: "g1"))
        XCTAssertEqual(outbox.pendingEntries.first?.ownerUserId, "u1")

        // Persisted with the owner and readable by a fresh instance.
        let reloaded = WorkoutSyncOutbox(suite: suite, currentUserId: { "u1" })
        TestRetain.keep(reloaded)
        XCTAssertEqual(reloaded.pendingEntries.first?.ownerUserId, "u1")
    }

    func testOwnerFilterSendsOwnAdoptsLegacyDropsForeign() {
        XCTAssertEqual(WorkoutSyncOutbox.ownerFilter(for: entry(gameId: "g", owner: "u1"), currentUserId: "u1"), .send)
        XCTAssertEqual(WorkoutSyncOutbox.ownerFilter(for: entry(gameId: "g", owner: nil), currentUserId: "u1"), .adopt)
        XCTAssertEqual(WorkoutSyncOutbox.ownerFilter(for: entry(gameId: "g", owner: "u2"), currentUserId: "u1"), .drop)
    }

    func testLegacyRowsWithoutOwnerStillDecode() throws {
        // Payload written by a build that predates `ownerUserId`.
        let legacy = """
        [{"gameId":"g1","durationSeconds":60,"totalEnergyKcal":null,"avgHeartRate":null,"maxHeartRate":null,"startedAt":"2026-09-20T10:00:00.000Z","endedAt":"2026-09-20T10:01:00.000Z","source":"APPLE_WATCH","healthExternalId":null,"enqueuedAt":0}]
        """
        suite.set(Data(legacy.utf8), forKey: "bandeja.workout.outbox.v1")
        let outbox = WorkoutSyncOutbox(suite: suite, currentUserId: { "u1" })
        TestRetain.keep(outbox)
        XCTAssertEqual(outbox.pendingCount, 1)
        XCTAssertNil(outbox.pendingEntries.first?.ownerUserId)
    }

    func testClearDropsEverything() {
        let outbox = WorkoutSyncOutbox(suite: suite, currentUserId: { "u1" })
        TestRetain.keep(outbox)
        outbox.enqueue(entry(gameId: "g1"))
        outbox.enqueue(entry(gameId: "g2"))
        outbox.clear()
        XCTAssertEqual(outbox.pendingCount, 0)
        XCTAssertNil(suite.data(forKey: "bandeja.workout.outbox.v1"))
    }

    func testPoisonErrorsAreDroppedTransientKept() {
        XCTAssertFalse(WorkoutSyncOutbox.shouldKeepAfterFailure(APIError.httpError(400)))
        XCTAssertFalse(WorkoutSyncOutbox.shouldKeepAfterFailure(APIError.httpError(401)))
        XCTAssertFalse(WorkoutSyncOutbox.shouldKeepAfterFailure(APIError.httpError(404)))
        XCTAssertFalse(WorkoutSyncOutbox.shouldKeepAfterFailure(APIError.httpError(422)))
        XCTAssertFalse(WorkoutSyncOutbox.shouldKeepAfterFailure(APIError.noToken))
        XCTAssertTrue(WorkoutSyncOutbox.shouldKeepAfterFailure(APIError.httpError(408)))
        XCTAssertTrue(WorkoutSyncOutbox.shouldKeepAfterFailure(APIError.httpError(429)))
        XCTAssertTrue(WorkoutSyncOutbox.shouldKeepAfterFailure(APIError.httpError(503)))
        XCTAssertTrue(WorkoutSyncOutbox.shouldKeepAfterFailure(URLError(.notConnectedToInternet)))
    }
}
