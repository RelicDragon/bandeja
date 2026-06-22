import Foundation
import BandejaWatchShared

enum WidgetGameCache {
    static func read() -> [CachedNextGame] {
        NextGamesCache.read()
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
