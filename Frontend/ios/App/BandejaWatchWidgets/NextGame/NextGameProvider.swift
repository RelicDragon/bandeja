import WidgetKit
import BandejaNextGames

struct NextGameProvider: TimelineProvider {
    func placeholder(in context: Context) -> NextGameEntry {
        NextGameEntry.placeholder
    }

    func getSnapshot(in context: Context, completion: @escaping (NextGameEntry) -> Void) {
        completion(makeEntry(reference: .now))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NextGameEntry>) -> Void) {
        let now = Date.now
        let dates = Self.entryDates(now: now, games: WidgetGameCache.read())
        let entries = dates.map { makeEntry(reference: $0) }
        completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(30 * 60))))
    }

    /// Countdown text is live (`Text(date, style: .relative)`), so entries are only needed
    /// where the *picked game* or its static state flips: at start ("Now") and one hour later
    /// ("Ended" / next game). Kept small so WidgetKit's budget is not burned on 5-minute ticks.
    static func entryDates(now: Date, games: [CachedNextGame]) -> [Date] {
        var dates: [Date] = [now]
        guard let game = NextGamePicker.pickNextDisplayable(from: games, reference: now) else { return dates }
        if game.startTime > now {
            dates.append(game.startTime)
        }
        let ended = game.startTime.addingTimeInterval(3600)
        if ended > now {
            dates.append(ended)
        }
        return dates
    }

    private func makeEntry(reference: Date) -> NextGameEntry {
        let isAuth = NextGamesCache.isAuthenticated()
        let game = WidgetGameCache.nextDisplayableGame(reference: reference)
        return NextGameEntry(date: reference, game: game, isAuthenticated: isAuth)
    }
}

#if canImport(RelevanceKit)
import RelevanceKit

@available(watchOS 11.0, *)
extension NextGameProvider {
    func relevance() async -> WidgetRelevance<Void> {
        let games = WidgetGameCache.read()
        let now = Date.now
        var attributes: [WidgetRelevanceAttribute<Void>] = []
        for game in games.prefix(5) where game.startTime > now && game.status != "FINISHED" && game.status != "ARCHIVED" {
            let from = game.startTime.addingTimeInterval(-2 * 3600)
            let to = game.startTime.addingTimeInterval(3600)
            guard to > now else { continue }
            let startRelevance = max(from, now)
            let ctx = RelevantContext.date(from: startRelevance, to: to)
            attributes.append(WidgetRelevanceAttribute(context: ctx))
        }
        return WidgetRelevance(attributes)
    }
}
#endif
