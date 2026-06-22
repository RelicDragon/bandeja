import WidgetKit
import BandejaWatchShared

struct LiveActiveMatchProvider: TimelineProvider {
    func placeholder(in context: Context) -> LiveActiveMatchEntry {
        LiveActiveMatchEntry(date: .now, title: "Live", score: "0-0", active: false)
    }

    func getSnapshot(in context: Context, completion: @escaping (LiveActiveMatchEntry) -> Void) {
        completion(makeEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<LiveActiveMatchEntry>) -> Void) {
        let entry = makeEntry()
        let next = Date.now.addingTimeInterval(60)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    private func makeEntry() -> LiveActiveMatchEntry {
        guard let payload = LiveActiveSnapshotStore.read() else {
            return LiveActiveMatchEntry(date: .now, title: "Bandeja", score: "—", active: false)
        }
        return LiveActiveMatchEntry(
            date: .now,
            title: payload.titleLine,
            score: payload.scoreLine,
            active: true
        )
    }
}
