import Foundation
import BandejaNextGames
import XCTest

final class BandejaNextGamesTests: XCTestCase {
    private var suiteName: String!
    private var suite: UserDefaults!

    override func setUp() {
        super.setUp()
        suiteName = "group.test.bandeja.nextgames.\(UUID().uuidString)"
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

    func testNextGamesCacheReadsFractionalISO() {
        let raw = """
        [{"id":"g1","title":"T","clubName":null,"startTime":"2023-11-14T22:13:20.123Z","status":"READY","resultsStatus":"NONE","gameType":"MATCH","participantCount":1,"maxParticipants":4,"sport":"PADEL","playersPerMatch":4}]
        """
        suite.set(Data(raw.utf8), forKey: AppGroupStorage.Keys.nextGames)
        let readBack = NextGamesCache.read(suite: suite)
        XCTAssertEqual(readBack.count, 1)
        XCTAssertEqual(readBack[0].id, "g1")
        XCTAssertEqual(readBack[0].startTime.timeIntervalSince1970, 1_700_000_000.123, accuracy: 0.001)
    }

    func testNextGamesEnvelopeStoreRoundTrip() {
        let game = CachedNextGame(
            id: "g2",
            title: "Evening tennis",
            clubName: "Club B",
            startTime: Date(timeIntervalSince1970: 1_700_100_000),
            status: "READY",
            resultsStatus: "NONE",
            gameType: "MATCH",
            participantCount: 4,
            maxParticipants: 4,
            sport: "TENNIS",
            playersPerMatch: 4
        )
        XCTAssertTrue(
            NextGamesEnvelopeStore.write(
                NextGamesEnvelope(isAuthenticated: true, language: "es", games: [game]),
                suite: suite
            )
        )
        let readBack = NextGamesEnvelopeStore.read(suite: suite)
        XCTAssertTrue(readBack.isAuthenticated)
        XCTAssertEqual(readBack.language, "es")
        XCTAssertEqual(readBack.games.count, 1)
        XCTAssertEqual(readBack.games[0].id, "g2")
        XCTAssertTrue(NextGamesEnvelopeStore.clear(suite: suite))
        let cleared = NextGamesEnvelopeStore.read(suite: suite)
        XCTAssertFalse(cleared.isAuthenticated)
        XCTAssertEqual(cleared.language, "es")
        XCTAssertTrue(cleared.games.isEmpty)
    }

    func testNextGamesEnvelopeStoreRejectsMissingSuite() {
        XCTAssertFalse(
            NextGamesEnvelopeStore.write(
                .unauthenticated(language: "en"),
                suite: nil
            )
        )
        XCTAssertFalse(NextGamesEnvelopeStore.clear(suite: nil))
    }

    func testHomeWidgetKindIsStable() {
        XCTAssertEqual(HomeWidgetKinds.nextGame, "com.funified.bandeja.home.nextGame")
    }

    func testAppGroupStorageContractsAreStable() {
        XCTAssertEqual(AppGroupStorage.suiteName, "group.com.funified.bandeja")
        XCTAssertEqual(AppGroupStorage.Keys.nextGames, "bandeja.widget.nextGames.v1")
        XCTAssertEqual(AppGroupStorage.Keys.uiLanguage, "bandeja.widget.uiLanguage.v1")
        XCTAssertEqual(AppGroupStorage.Keys.isAuthenticated, "bandeja.widget.isAuthenticated.v1")
    }

    func testEnvelopeAndCacheKeysDoNotOverlapLanguageAuth() {
        let game = CachedNextGame(
            id: "g3",
            title: "T",
            clubName: nil,
            startTime: Date(timeIntervalSince1970: 1_700_000_000),
            status: "READY",
            resultsStatus: "NONE",
            gameType: "MATCH",
            participantCount: 1,
            maxParticipants: 4
        )
        XCTAssertTrue(
            NextGamesEnvelopeStore.write(
                NextGamesEnvelope(isAuthenticated: true, language: "cs", games: [game]),
                suite: suite
            )
        )
        XCTAssertNotNil(suite.data(forKey: AppGroupStorage.Keys.nextGames))
        XCTAssertEqual(suite.string(forKey: AppGroupStorage.Keys.uiLanguage), "cs")
        XCTAssertEqual(suite.bool(forKey: AppGroupStorage.Keys.isAuthenticated), true)
        XCTAssertNil(suite.data(forKey: "watchLiveActiveScoringV1"))
    }
}
