import Foundation
import Observation
import os

@Observable
@MainActor
final class ScoringOutbox {
    static let shared = ScoringOutbox()

    private static let udKey = "bandeja.scoring.outbox.v1"
    private static let log = Logger(subsystem: Bundle.main.bundleIdentifier ?? "BandejaWatch", category: "ScoringOutbox")

    private let ud = UserDefaults(suiteName: KeychainHelper.accessGroup)
    private(set) var pendingEntries: [Entry] = []

    struct Entry: Codable, Identifiable {
        var id: String { matchId }
        let gameId: String
        let matchId: String
        let teamA: [String]
        let teamB: [String]
        let sets: [WatchSetWrite]
        let enqueuedAt: Date
    }

    private init() {
        load()
    }

    var pendingCount: Int { pendingEntries.count }

    func hasPending(forGameId id: String) -> Bool {
        pendingEntries.contains { $0.gameId == id }
    }

    func hasPending(forMatchId id: String) -> Bool {
        pendingEntries.contains { $0.matchId == id }
    }

    func load() {
        guard let data = ud?.data(forKey: Self.udKey),
              let decoded = try? JSONDecoder().decode([Entry].self, from: data) else {
            pendingEntries = []
            return
        }
        pendingEntries = decoded
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(pendingEntries) else { return }
        ud?.set(data, forKey: Self.udKey)
    }

    func enqueue(_ entry: Entry) {
        pendingEntries.removeAll { $0.matchId == entry.matchId }
        pendingEntries.append(entry)
        save()
    }

    func remove(matchId: String) {
        pendingEntries.removeAll { $0.matchId == matchId }
        save()
    }

    func clear() {
        pendingEntries = []
        ud?.removeObject(forKey: Self.udKey)
    }

    func flush() async {
        guard KeychainHelper.shared.readToken() != nil else { return }
        guard !pendingEntries.isEmpty else { return }

        let api = APIClient()
        var remaining: [Entry] = []

        for entry in pendingEntries {
            let body = WatchUpdateMatchBody(teamA: entry.teamA, teamB: entry.teamB, sets: entry.sets)
            do {
                try await api.sendVoid(.updateMatch(gameId: entry.gameId, matchId: entry.matchId), body: body)
                WatchSessionManager.shared.notifyScoreUpdated(gameId: entry.gameId)
                Self.log.debug("Scoring outbox flushed matchId=\(entry.matchId, privacy: .public)")
            } catch {
                if Self.shouldDropAfterFailure(error) {
                    Self.log.error("Scoring outbox drop matchId=\(entry.matchId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                } else {
                    Self.log.error("Scoring outbox keep matchId=\(entry.matchId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                    remaining.append(entry)
                }
            }
        }

        pendingEntries = remaining
        save()
    }

    private static func shouldDropAfterFailure(_ error: Error) -> Bool {
        if let api = error as? APIError {
            switch api {
            case .httpError(let code):
                return !APIError.httpStatusWarrantsOutboxRetry(code)
            case .noToken:
                return true
            case .decodingError:
                return true
            }
        }
        return false
    }
}
