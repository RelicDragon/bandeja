import Foundation
import BandejaNextGames

extension CachedNextGame {
    var relativeTimeString: String {
        let lang = WatchWidgetCopy.widgetLang()
        let interval = startTime.timeIntervalSince(.now)
        if interval < 0, interval > -3600 { return WatchWidgetCopy.now(lang) }
        if interval < 0 { return WatchWidgetCopy.ended(lang) }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: startTime, relativeTo: .now)
    }

    var hoursUntilStart: Double {
        max(0, startTime.timeIntervalSince(.now) / 3600)
    }
}
