import Foundation
import Observation

struct WatchMatchTimerRelayMessage: Sendable {
    let gameId: String
    let matchId: String
    let snapshot: WatchMatchTimerSnapshot?
    /// Local wall-clock time the snapshot arrived. Elapsed-time display anchors on this
    /// (`elapsedMs + (now - receivedAt)`) so a skewed server clock cannot shift the timer.
    let receivedAt: Date

    init(gameId: String, matchId: String, snapshot: WatchMatchTimerSnapshot?, receivedAt: Date = Date()) {
        self.gameId = gameId
        self.matchId = matchId
        self.snapshot = snapshot
        self.receivedAt = receivedAt
    }

    init?(dict: [String: Any], receivedAt: Date = Date()) {
        guard let gameId = dict["gameId"] as? String,
              let matchId = dict["matchId"] as? String else { return nil }
        self.gameId = gameId
        self.matchId = matchId
        self.receivedAt = receivedAt
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
        ingest(message)
    }

    /// Typed entry point for snapshots the watch obtained itself (HTTP transition / fetch).
    func ingest(gameId: String, matchId: String, snapshot: WatchMatchTimerSnapshot) {
        ingest(WatchMatchTimerRelayMessage(gameId: gameId, matchId: matchId, snapshot: snapshot))
    }

    private func ingest(_ message: WatchMatchTimerRelayMessage) {
        lastMessage = message
        tick += 1
    }

    /// Last known status for a match, or `nil` when the store holds nothing for it.
    func lastStatus(gameId: String, matchId: String) -> String? {
        guard let m = lastMessage, m.gameId == gameId, m.matchId == matchId else { return nil }
        return m.snapshot?.status
    }
}
