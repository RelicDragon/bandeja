import Foundation
@testable import BandejaNextGames
import XCTest

final class PickNextGameGoldenFixturesTests: XCTestCase {
    private static let requiredCases: Set<String> = [
        "empty-list",
        "one-upcoming",
        "in-now-minus-1h-window",
        "finished-archived-excluded",
        "tie-break-by-startTime",
    ]

    func testPolicyStringMatchesCanonical() throws {
        let catalog = try PickNextGameGoldenFixtures.loadCatalog()
        XCTAssertEqual(catalog.policy, PickNextGameGoldenFixtures.expectedPolicy)
        XCTAssertEqual(NextGamePicker.displayPolicy, PickNextGameGoldenFixtures.expectedPolicy)
        XCTAssertEqual(NextGamePicker.lookbackMilliseconds, 3_600_000)
    }

    func testCatalogMeetsMinimumCaseCount() throws {
        let catalog = try PickNextGameGoldenFixtures.loadCatalog()
        XCTAssertGreaterThanOrEqual(catalog.cases.count, catalog.minCases)
        XCTAssertGreaterThanOrEqual(catalog.minCases, 5)
        let names = Set(catalog.cases.map(\.name))
        XCTAssertTrue(
            Self.requiredCases.isSubset(of: names),
            "missing \(Self.requiredCases.subtracting(names))"
        )
    }

    func testGoldenCasesMatchPicker() throws {
        let catalog = try PickNextGameGoldenFixtures.loadCatalog()
        for fixture in catalog.cases {
            let games = try PickNextGameGoldenFixtures.cachedGames(from: fixture.games)
            let reference = try PickNextGameGoldenFixtures.referenceDate(from: fixture.reference)
            let next = NextGamePicker.pickNextDisplayable(from: games, reference: reference)
            XCTAssertEqual(
                next?.id,
                fixture.expectedId,
                "golden case \(fixture.name)"
            )
            let listed = NextGamePicker.listDisplayable(from: games, reference: reference)
            XCTAssertEqual(listed.first?.id, next?.id, "listDisplayable head \(fixture.name)")
            if listed.count >= 2 {
                for i in 1 ..< listed.count {
                    XCTAssertLessThanOrEqual(
                        listed[i - 1].startTime,
                        listed[i].startTime,
                        "listDisplayable sorted \(fixture.name)"
                    )
                }
            }
        }
    }
}
