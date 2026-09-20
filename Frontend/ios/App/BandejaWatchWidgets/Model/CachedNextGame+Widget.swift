import Foundation
import BandejaNextGames

extension CachedNextGame {
    /// Static fallback text for games already started; future games render a live
    /// `Text(date, style: .relative)` instead so the timeline never shows a stale value.
    func relativeTimeString(reference: Date = .now) -> String {
        let lang = WatchWidgetCopy.widgetLang()
        let interval = startTime.timeIntervalSince(reference)
        if interval < 0, interval > -3600 { return WatchWidgetCopy.now(lang) }
        if interval < 0 { return WatchWidgetCopy.ended(lang) }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        formatter.locale = WatchWidgetCopy.formatterLocale()
        return formatter.localizedString(for: startTime, relativeTo: reference)
    }

    var relativeTimeString: String { relativeTimeString(reference: .now) }

    func hoursUntilStart(reference: Date = .now) -> Double {
        max(0, startTime.timeIntervalSince(reference) / 3600)
    }

    var hoursUntilStart: Double { hoursUntilStart(reference: .now) }

    /// True while the game has not started yet (relative to `reference`).
    func startsAfter(_ reference: Date) -> Bool {
        startTime > reference
    }
}
