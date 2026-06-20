import XCTest
@testable import BandejaWatch_Watch_App

@MainActor
final class ServeGuideGoldenFixturesTests: XCTestCase {
    func testSharedCatalogMatchesServeGuideEngine() throws {
        let catalog = try ServeGuideGoldenFixtures.loadCatalog()
        XCTAssertGreaterThanOrEqual(catalog.count, 19)
        for entry in catalog {
            let inputs = try ServeGuideGoldenFixtures.inputs(for: entry)
            let snap = ServeGuideEngine.compute(inputs)
            let err = ServeGuideGoldenFixtures.assertSnapshot(snap, matches: entry)
            XCTAssertNil(err, err ?? entry.name)
        }
    }
}
