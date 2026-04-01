import WatchKit

enum WatchScoreHaptics {
    static func point() {
        WKInterfaceDevice.current().play(.click)
    }

    static func undo() {
        WKInterfaceDevice.current().play(.directionDown)
    }
}
