import Foundation
import Observation

extension Notification.Name {
    static let watchLiveScoringRelayDidUpdate = Notification.Name("bandeja.watch.liveScoringRelayDidUpdate")
}

struct WatchLiveScoringRelayMessage: Sendable {
    let gameId: String
    let matchId: String
    let envelope: WatchLiveScoringEnvelope?
    let revisionHint: Int
    let isExplicitClear: Bool

    init?(dict: [String: Any]) {
        guard let gameId = dict["gameId"] as? String,
              let matchId = dict["matchId"] as? String else { return nil }
        self.gameId = gameId
        self.matchId = matchId
        revisionHint = Self.parseRevision(dict["revision"])

        if dict["liveScoring"] is NSNull {
            envelope = nil
            isExplicitClear = true
            return
        }
        isExplicitClear = false
        guard let raw = dict["liveScoring"] else {
            envelope = nil
            return
        }
        guard JSONSerialization.isValidJSONObject(raw),
              let data = try? JSONSerialization.data(withJSONObject: raw),
              let decoded = try? JSONDecoder().decode(WatchLiveScoringEnvelope.self, from: data) else {
            envelope = nil
            return
        }
        envelope = decoded
    }

    private static func parseRevision(_ value: Any?) -> Int {
        if let n = value as? Int { return n }
        if let n = value as? Double { return Int(n) }
        return 0
    }
}

@Observable
@MainActor
final class WatchLiveScoringRelayStore {
    static let shared = WatchLiveScoringRelayStore()

    private(set) var tick = 0
    private(set) var lastMessage: WatchLiveScoringRelayMessage?
    private(set) var lastRelayReceivedAt: Date?
    private(set) var lastRelayRevision = 0
    private(set) var lastRelayGameId: String?
    private(set) var lastRelayMatchId: String?

    static let remotePollFreshnessWindow: TimeInterval = 10

    private init() {}

    func ingest(_ dict: [String: Any]) {
        guard let message = WatchLiveScoringRelayMessage(dict: dict) else { return }
        lastMessage = message
        tick += 1
        NotificationCenter.default.post(name: .watchLiveScoringRelayDidUpdate, object: nil)
    }

    func markApplied(gameId: String, matchId: String, revision: Int) {
        lastRelayReceivedAt = Date()
        if lastRelayGameId == gameId, lastRelayMatchId == matchId {
            lastRelayRevision = max(lastRelayRevision, revision)
        } else {
            lastRelayRevision = revision
        }
        lastRelayGameId = gameId
        lastRelayMatchId = matchId
    }

    func suppressesRemotePoll(gameId: String, matchId: String, currentRevision: Int) -> Bool {
        guard lastRelayGameId == gameId, lastRelayMatchId == matchId else { return false }
        guard let receivedAt = lastRelayReceivedAt else { return false }
        guard Date().timeIntervalSince(receivedAt) < Self.remotePollFreshnessWindow else { return false }
        return currentRevision >= lastRelayRevision
    }
}
