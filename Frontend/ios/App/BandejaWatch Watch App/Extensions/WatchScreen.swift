import WatchKit

enum WatchScreen {
    /// 40 mm / 41 mm cases (screen narrower than 176 pt) get tighter scoring layouts.
    static var isCompact: Bool {
        WKInterfaceDevice.current().screenBounds.width < 176
    }
}
