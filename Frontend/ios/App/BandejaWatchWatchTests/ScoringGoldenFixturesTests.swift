import XCTest
@testable import BandejaWatch_Watch_App

@MainActor
final class ScoringGoldenFixturesTests: XCTestCase {
    func testSharedCatalogMatchesWatchLiveScoringEngine() throws {
        let catalog = try ScoringGoldenFixtures.loadCatalog()
        XCTAssertGreaterThanOrEqual(catalog.count, 9)
        for entry in catalog {
            let result = ScoringGoldenFixtures.runFixture(entry)
            let err = ScoringGoldenFixtures.assertResult(result, matches: entry)
            XCTAssertNil(err, err ?? entry.name)
        }
    }
}
