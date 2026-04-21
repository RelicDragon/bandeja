import Foundation

struct WatchMatchTimerSnapshot: Codable, Sendable, Equatable {
    let status: String
    let startedAt: String?
    let pausedAt: String?
    let elapsedMs: Int
    let capMinutes: Int?
    let serverNow: String
    let expiresAt: String?
    let capJustNotified: Bool?
}

struct WatchMatchTimerEnvelope: Decodable, Sendable {
    let snapshot: WatchMatchTimerSnapshot
}
