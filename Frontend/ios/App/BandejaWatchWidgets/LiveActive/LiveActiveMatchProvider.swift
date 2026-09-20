import WidgetKit
import BandejaWatchShared

struct LiveActiveMatchProvider: TimelineProvider {
    func placeholder(in context: Context) -> LiveActiveMatchEntry {
        let lang = WatchWidgetCopy.widgetLang()
        return LiveActiveMatchEntry(
            date: .now,
            title: WatchWidgetCopy.liveWidgetPlaceholder(lang),
            score: "0-0",
            active: false,
            gameId: nil
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (LiveActiveMatchEntry) -> Void) {
        completion(makeEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<LiveActiveMatchEntry>) -> Void) {
        let entry = makeEntry()
        // The app reloads this widget on every score change; with no active match there is
        // nothing to poll for, so wait for the next explicit reload instead of burning budget.
        let policy: TimelineReloadPolicy = entry.active
            ? .after(Date.now.addingTimeInterval(5 * 60))
            : .never
        completion(Timeline(entries: [entry], policy: policy))
    }

    private func makeEntry() -> LiveActiveMatchEntry {
        guard let payload = LiveActiveSnapshotStore.read() else {
            return LiveActiveMatchEntry(
                date: .now,
                title: WatchWidgetCopy.brand(),
                score: "—",
                active: false,
                gameId: nil
            )
        }
        return LiveActiveMatchEntry(
            date: .now,
            title: payload.titleLine,
            score: payload.scoreLine,
            active: true,
            gameId: payload.gameId
        )
    }
}
