import WidgetKit
import BandejaWatchShared

struct HomeNextGameEntry: TimelineEntry {
    let date: Date
    let game: CachedNextGame?
    let isAuthenticated: Bool
    let language: String

    static var placeholder: HomeNextGameEntry {
        let lang = HomeWidgetCopy.widgetLang()
        return HomeNextGameEntry(
            date: .now,
            game: CachedNextGame(
                id: "placeholder",
                title: HomeWidgetCopy.placeholderGameTitle(lang),
                clubName: HomeWidgetCopy.placeholderClub(lang),
                startTime: .now.addingTimeInterval(7200),
                status: "ANNOUNCED",
                resultsStatus: "NONE",
                gameType: "MATCH",
                participantCount: 3,
                maxParticipants: 4,
                sport: "PADEL",
                playersPerMatch: 4
            ),
            isAuthenticated: true,
            language: lang
        )
    }
}

extension CachedNextGame {
    func relativeTimeString(lang: String, reference: Date = .now) -> String {
        let interval = startTime.timeIntervalSince(reference)
        if interval < 0, interval > -3600 { return HomeWidgetCopy.now(lang) }
        if interval < 0 { return HomeWidgetCopy.ended(lang) }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        formatter.locale = locale(for: lang)
        return formatter.localizedString(for: startTime, relativeTo: reference)
    }

    func absoluteTimeString(lang: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale(for: lang)
        formatter.doesRelativeDateFormatting = true
        formatter.dateStyle = .short
        formatter.timeStyle = .short
        return formatter.string(from: startTime)
    }
}

private func locale(for lang: String) -> Locale {
    switch lang {
    case "es": return Locale(identifier: "es")
    case "ru": return Locale(identifier: "ru")
    case "sr": return Locale(identifier: "sr")
    case "cs": return Locale(identifier: "cs")
    default: return Locale(identifier: "en")
    }
}
