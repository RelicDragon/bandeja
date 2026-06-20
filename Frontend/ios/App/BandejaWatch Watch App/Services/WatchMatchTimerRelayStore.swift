import Foundation
import Observation

struct WatchMatchTimerRelayMessage: Sendable {
    let gameId: String
    let matchId: String
    let snapshot: WatchMatchTimerSnapshot?

    init?(dict: [String: Any]) {
        guard let gameId = dict["gameId"] as? String,
              let matchId = dict["matchId"] as? String else { return nil }
        self.gameId = gameId
        self.matchId = matchId
        guard let raw = dict["snapshot"] else {
            snapshot = nil
            return
        }
        guard JSONSerialization.isValidJSONObject(raw),
              let data = try? JSONSerialization.data(withJSONObject: raw),
              let decoded = try? JSONDecoder().decode(WatchMatchTimerSnapshot.self, from: data) else {
            snapshot = nil
            return
        }
        snapshot = decoded
    }
}

enum WatchMatchTimerSnapshotOrdering {
    private static func parseIso8601(_ string: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: string) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: string)
    }

    static func isIncomingAtLeastAsNew(
        _ incoming: WatchMatchTimerSnapshot,
        than current: WatchMatchTimerSnapshot?
    ) -> Bool {
        guard let current else { return true }
        guard let incomingAt = parseIso8601(incoming.serverNow) else { return true }
        guard let currentAt = parseIso8601(current.serverNow) else { return true }
        return incomingAt >= currentAt
    }
}

@Observable
@MainActor
final class WatchMatchTimerRelayStore {
    static let shared = WatchMatchTimerRelayStore()

    private(set) var tick = 0
    private(set) var lastMessage: WatchMatchTimerRelayMessage?

    private init() {}

    func ingest(_ dict: [String: Any]) {
        guard let message = WatchMatchTimerRelayMessage(dict: dict) else { return }
        lastMessage = message
        tick += 1
    }
}
