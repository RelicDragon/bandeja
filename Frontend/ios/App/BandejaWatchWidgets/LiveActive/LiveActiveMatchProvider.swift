import WidgetKit

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
        let suite = UserDefaults(suiteName: "group.com.funified.bandeja")
        let key = "watchLiveActiveScoringV1"
        struct Payload: Decodable {
            let titleLine: String
            let scoreLine: String
        }
        guard let data = suite?.data(forKey: key),
              let p = try? JSONDecoder().decode(Payload.self, from: data)
        else {
            return LiveActiveMatchEntry(date: .now, title: "Bandeja", score: "—", active: false)
        }
        return LiveActiveMatchEntry(date: .now, title: p.titleLine, score: p.scoreLine, active: true)
    }
}
