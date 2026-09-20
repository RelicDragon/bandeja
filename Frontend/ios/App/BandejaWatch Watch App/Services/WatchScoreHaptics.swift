import WatchKit

enum WatchScoreHaptics {
    /// Set while the view model replays unacknowledged local taps on top of a remote
    /// state so the wrist does not buzz for points the user already felt.
    static var suppressed = false

    static func point() {
        guard !suppressed else { return }
        WKInterfaceDevice.current().play(.click)
    }

    static func undo() {
        guard !suppressed else { return }
        WKInterfaceDevice.current().play(.directionDown)
    }

    static func serveGuideChange() {
        guard !suppressed else { return }
        WKInterfaceDevice.current().play(.notification)
    }
}
