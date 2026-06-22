import XCTest
@testable import BandejaWatch_Watch_App

final class WatchApiConfigTests: XCTestCase {
    private static let appGroupSuiteName = "group.com.funified.bandeja"
    private static let defaultsKey = "bandeja_native_api_base_url"

    override func tearDown() {
        UserDefaults(suiteName: Self.appGroupSuiteName)?.removeObject(forKey: Self.defaultsKey)
        super.tearDown()
    }

    func testFallsBackToProductionWhenAppGroupEmpty() {
        UserDefaults(suiteName: Self.appGroupSuiteName)?.removeObject(forKey: Self.defaultsKey)
        XCTAssertEqual(WatchApiConfig.apiBaseUrlString(), WatchApiConfig.defaultApiBaseUrl)
        XCTAssertEqual(WatchApiConfig.mediaOrigin(), "https://bandeja.me")
    }

    func testReadsApiBaseUrlFromAppGroup() {
        let suite = UserDefaults(suiteName: Self.appGroupSuiteName)
        suite?.set("https://staging.bandeja.me/api", forKey: Self.defaultsKey)
        XCTAssertEqual(WatchApiConfig.apiBaseUrlString(), "https://staging.bandeja.me/api")
        XCTAssertEqual(WatchApiConfig.mediaOrigin(), "https://staging.bandeja.me")
    }

    func testMediaOriginStripsTrailingApiSlash() {
        let suite = UserDefaults(suiteName: Self.appGroupSuiteName)
        suite?.set("https://dev.example.com/api/", forKey: Self.defaultsKey)
        XCTAssertEqual(WatchApiConfig.mediaOrigin(), "https://dev.example.com")
    }
}
