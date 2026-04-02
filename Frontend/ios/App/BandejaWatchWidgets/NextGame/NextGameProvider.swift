import RelevanceKit
import WidgetKit

struct NextGameProvider: TimelineProvider {
    func placeholder(in context: Context) -> NextGameEntry {
        NextGameEntry.placeholder
    }

    func getSnapshot(in context: Context, completion: @escaping (NextGameEntry) -> Void) {
        completion(makeEntry(reference: .now))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NextGameEntry>) -> Void) {
        let now = Date.now
        let entry = makeEntry(reference: now)
        let defaultRefresh = now.addingTimeInterval(30 * 60)
        let refresh: Date
        if let game = entry.game, game.startTime > now {
            refresh = min(game.startTime, defaultRefresh)
        } else {
            refresh = defaultRefresh
        }
        completion(Timeline(entries: [entry], policy: .after(refresh)))
    }

    func relevance() async -> WidgetRelevance<Void> {
        let games = WidgetGameCache.read()
        let now = Date.now
        var attributes: [WidgetRelevanceAttribute<Void>] = []
        for game in games.prefix(5) where game.startTime > now && game.status != "FINISHED" && game.status != "ARCHIVED" {
            let from = game.startTime.addingTimeInterval(-2 * 3600)
            let to = game.startTime.addingTimeInterval(3600)
            guard to > now else { continue }
            let startRelevance = max(from, now)
            let ctx = RelevantContext.date(range: startRelevance...to, kind: .scheduled)
            attributes.append(WidgetRelevanceAttribute(context: ctx))
        }
        return WidgetRelevance(attributes)
    }

    private func makeEntry(reference: Date) -> NextGameEntry {
        let isAuth = WidgetKeychain.readToken() != nil
        let game = WidgetGameCache.nextDisplayableGame(reference: reference)
        return NextGameEntry(date: reference, game: game, isAuthenticated: isAuth)
    }
}
