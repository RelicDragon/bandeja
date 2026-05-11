import Foundation
import WidgetKit

enum WatchLiveActiveSnapshotStore {
    private static let suiteName = "group.com.funified.bandeja"
    private static let storageKey = "watchLiveActiveScoringV1"
    private static let widgetKind = "com.funified.bandeja.liveActiveMatch"

    struct Payload: Codable, Sendable {
        var gameId: String
        var matchId: String
        var titleLine: String
        var scoreLine: String
    }

    static func publish(gameId: String, matchId: String, titleLine: String, scoreLine: String) {
        let p = Payload(gameId: gameId, matchId: matchId, titleLine: titleLine, scoreLine: scoreLine)
        guard let data = try? JSONEncoder().encode(p) else { return }
        UserDefaults(suiteName: suiteName)?.set(data, forKey: storageKey)
        WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
    }

    static func clear() {
        UserDefaults(suiteName: suiteName)?.removeObject(forKey: storageKey)
        WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
    }

    static func readPayload() -> Payload? {
        guard let data = UserDefaults(suiteName: suiteName)?.data(forKey: storageKey) else { return nil }
        return try? JSONDecoder().decode(Payload.self, from: data)
    }
}
