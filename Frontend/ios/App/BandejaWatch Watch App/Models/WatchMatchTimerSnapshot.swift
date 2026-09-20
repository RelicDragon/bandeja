import Foundation

nonisolated struct WatchMatchTimerSnapshot: Codable, Sendable, Equatable {
    let status: String
    let startedAt: String?
    let pausedAt: String?
    let elapsedMs: Int
    let capMinutes: Int?
    let serverNow: String
    let expiresAt: String?
    let capJustNotified: Bool?

    /// JSON-object form matching the phone relay payload (`WatchMatchTimerRelayMessage(dict:)`).
    func asDictionary() -> [String: Any]? {
        guard let data = try? JSONEncoder().encode(self),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return obj
    }
}

struct WatchMatchTimerEnvelope: Decodable, Sendable {
    let snapshot: WatchMatchTimerSnapshot
}
