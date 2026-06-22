import XCTest
@testable import BandejaWatch_Watch_App

@MainActor
final class NetworkDeliveryOutboxTests: XCTestCase {
    private func sampleLiveState() -> WatchLiveScoringState {
        WatchLiveScoringState(
            activeSetIndex: 0,
            mode: .classic,
            sets: [],
            classic: WatchLiveClassicState(
                pointState: .regular(teamA: .zero, teamB: .zero),
                withinSetTieBreak: false,
                tieBreakA: 0,
                tieBreakB: 0,
                classicPointsPlayedInGame: 0
            ),
            firstServerTeam: nil,
            firstServerDoublesPlayerIndex: nil,
            pointsServeRotation: nil,
            matchStartCourtEndsSwapped: nil,
            matchStartTeamASidesMirrored: nil,
            matchStartTeamBSidesMirrored: nil,
            serveGuideSkipped: nil,
            optionalDeciderFormat: nil,
            timedClassicSetLocked: nil,
            pointWinnerLog: nil,
            officiatingLetPending: nil
        )
    }

    private func liveEntry(matchId: String, enqueuedAt: Date = Date()) -> NetworkDeliveryEntry {
        NetworkDeliveryEntry(
            gameId: "g1",
            matchId: matchId,
            operation: .livePatch(
                body: WatchPatchLiveScoringBody(
                    state: sampleLiveState(),
                    baseRevision: 0,
                    clientMessageId: "c-\(matchId)",
                    opId: "o-\(matchId)"
                )
            ),
            enqueuedAt: enqueuedAt
        )
    }

    private func matchPutEntry(matchId: String, enqueuedAt: Date = Date()) -> NetworkDeliveryEntry {
        NetworkDeliveryEntry(
            gameId: "g1",
            matchId: matchId,
            operation: .matchPut(teamA: ["a"], teamB: ["b"], sets: []),
            enqueuedAt: enqueuedAt
        )
    }

    func testFlushOrderLivePatchBeforeMatchPutForSameMatch() {
        let matchId = "m1"
        let entries = [
            matchPutEntry(matchId: matchId, enqueuedAt: Date(timeIntervalSince1970: 2)),
            liveEntry(matchId: matchId, enqueuedAt: Date(timeIntervalSince1970: 1)),
        ]

        let ordered = NetworkDeliveryFlushOrder.ordered(entries, matchId: matchId)

        XCTAssertEqual(ordered.count, 2)
        XCTAssertTrue(ordered[0].isLivePatch)
        XCTAssertFalse(ordered[1].isLivePatch)
    }

    func testFlushOrderLivePatchesBeforeAllMatchPutsWhenFlushingAll() {
        let entries = [
            matchPutEntry(matchId: "m2", enqueuedAt: Date(timeIntervalSince1970: 1)),
            liveEntry(matchId: "m1", enqueuedAt: Date(timeIntervalSince1970: 2)),
            matchPutEntry(matchId: "m1", enqueuedAt: Date(timeIntervalSince1970: 3)),
            liveEntry(matchId: "m2", enqueuedAt: Date(timeIntervalSince1970: 4)),
        ]

        let ordered = NetworkDeliveryFlushOrder.ordered(entries, matchId: nil)

        let firstMatchPutIndex = ordered.firstIndex(where: { !$0.isLivePatch })
        let lastLivePatchIndex = ordered.lastIndex(where: { $0.isLivePatch })
        XCTAssertNotNil(firstMatchPutIndex)
        XCTAssertNotNil(lastLivePatchIndex)
        XCTAssertLessThan(lastLivePatchIndex!, firstMatchPutIndex!)
    }
}
