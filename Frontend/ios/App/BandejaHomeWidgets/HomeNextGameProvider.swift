import WidgetKit
import BandejaNextGames

struct HomeNextGameProvider: TimelineProvider {
    func placeholder(in context: Context) -> HomeNextGameEntry {
        HomeNextGameEntry.placeholder
    }

    func getSnapshot(in context: Context, completion: @escaping (HomeNextGameEntry) -> Void) {
        completion(makeEntry(reference: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HomeNextGameEntry>) -> Void) {
        let now = Date()
        let entry = makeEntry(reference: now)
        let refresh = nextRefreshDate(for: entry.game, now: now)
        completion(Timeline(entries: [entry], policy: .after(refresh)))
    }

    private func makeEntry(reference: Date) -> HomeNextGameEntry {
        let envelope = NextGamesEnvelopeStore.read()
        let lang = HomeWidgetCopy.widgetLang(envelope.language)
        let game = envelope.isAuthenticated
            ? NextGamePicker.pickNextDisplayable(from: envelope.games, reference: reference)
            : nil
        return HomeNextGameEntry(
            date: reference,
            game: game,
            isAuthenticated: envelope.isAuthenticated,
            language: lang
        )
    }

    /// Prefer soon: game start, end of “still displayable” window (start+1h), or 30m heartbeat.
    private func nextRefreshDate(for game: CachedNextGame?, now: Date) -> Date {
        let heartbeat = now.addingTimeInterval(30 * 60)
        guard let game else { return heartbeat }
        var candidates: [Date] = [heartbeat]
        if game.startTime > now {
            candidates.append(game.startTime)
        }
        let dropAt = game.startTime.addingTimeInterval(3600)
        if dropAt > now {
            candidates.append(dropAt)
        }
        return candidates.min() ?? heartbeat
    }
}
