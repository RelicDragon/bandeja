import WidgetKit

struct NextGameEntry: TimelineEntry {
    let date: Date
    let game: CachedNextGame?
    let isAuthenticated: Bool

    static var placeholder: NextGameEntry {
        let lang = WatchWidgetCopy.widgetLang()
        return NextGameEntry(
            date: .now,
            game: CachedNextGame(
                id: "placeholder",
                title: WatchWidgetCopy.placeholderGameTitle(lang),
                clubName: WatchWidgetCopy.placeholderClub(lang),
                startTime: .now.addingTimeInterval(7200),
                status: "ANNOUNCED",
                resultsStatus: "NONE",
                gameType: "CLASSIC",
                participantCount: 3,
                maxParticipants: 4
            ),
            isAuthenticated: true
        )
    }
}
