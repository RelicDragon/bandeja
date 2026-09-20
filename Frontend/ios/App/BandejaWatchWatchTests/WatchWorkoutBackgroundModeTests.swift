import XCTest
@testable import BandejaWatch_Watch_App

/// Play starts an `HKWorkoutSession`; without `workout-processing`, watchOS force-terminates the app.
///
/// The mode is declared once, as `INFOPLIST_KEY_WKBackgroundModes` on the watch app target
/// (Debug + Release) in `project.pbxproj`; `BandejaWatchWatchApp-Info.plist` must not repeat it.
/// `Bundle.main` is the test host (the watch app), so this reads the merged Info.plist.
final class WatchWorkoutBackgroundModeTests: XCTestCase {
    func testInfoPlistDeclaresWorkoutProcessingBackgroundMode() {
        XCTAssertEqual(
            Bundle.main.bundleIdentifier,
            "com.funified.bandeja.watchkitapp",
            "TEST_HOST must be the watch app so Bundle.main reads its merged Info.plist"
        )
        let modes = Bundle.main.object(forInfoDictionaryKey: "WKBackgroundModes") as? [String] ?? []
        XCTAssertTrue(
            modes.contains("workout-processing"),
            "WKBackgroundModes must include workout-processing so Play→HKWorkoutSession does not quit the app"
        )
    }
}
