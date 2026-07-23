import XCTest
@testable import BandejaWatch_Watch_App

/// Play starts an `HKWorkoutSession`; without `workout-processing`, watchOS force-terminates the app.
final class WatchWorkoutBackgroundModeTests: XCTestCase {
    func testInfoPlistDeclaresWorkoutProcessingBackgroundMode() {
        let modes = Bundle.main.object(forInfoDictionaryKey: "WKBackgroundModes") as? [String] ?? []
        XCTAssertTrue(
            modes.contains("workout-processing"),
            "WKBackgroundModes must include workout-processing so Play→HKWorkoutSession does not quit the app"
        )
    }

    func testInfoPlistDeclaresAudioBackgroundModeForScoreHaptics() {
        let modes = Bundle.main.object(forInfoDictionaryKey: "WKBackgroundModes") as? [String] ?? []
        XCTAssertTrue(
            modes.contains("audio"),
            "WKBackgroundModes must include audio when score haptics run during an active workout session"
        )
    }
}
