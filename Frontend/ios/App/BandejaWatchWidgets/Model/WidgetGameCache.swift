import Foundation

enum WidgetGameCache {
    private static let key = "bandeja.widget.nextGames.v1"
    private static let suiteName = "group.com.funified.bandeja"

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    static func read() -> [CachedNextGame] {
        guard let suite = UserDefaults(suiteName: suiteName),
              let data = suite.data(forKey: key) else { return [] }
        return (try? decoder.decode([CachedNextGame].self, from: data)) ?? []
    }

    static func nextDisplayableGame(reference: Date = .now) -> CachedNextGame? {
        let cutoff = reference.addingTimeInterval(-3600)
        return read()
            .filter { $0.status != "FINISHED" && $0.status != "ARCHIVED" }
            .filter { $0.startTime > cutoff }
            .sorted { $0.startTime < $1.startTime }
            .first
    }
}
