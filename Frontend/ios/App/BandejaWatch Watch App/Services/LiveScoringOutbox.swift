import Foundation
import Observation
import os

@MainActor
protocol LiveScoringSessionSink: AnyObject {
    var gameId: String { get }
    var matchId: String { get }
    func applyLiveScoringEnvelopeIfNewer(_ envelope: WatchLiveScoringEnvelope?)
}

private final class WeakLiveScoringSink {
    weak var value: (any LiveScoringSessionSink)?
    init(_ value: any LiveScoringSessionSink) { self.value = value }
}

@Observable
@MainActor
final class LiveScoringOutbox {
    static let shared = LiveScoringOutbox()

    private static let udKey = "bandeja.liveScoring.outbox.v1"
    private static let log = Logger(subsystem: Bundle.main.bundleIdentifier ?? "BandejaWatch", category: "LiveScoringOutbox")

    private let ud = UserDefaults(suiteName: KeychainHelper.accessGroup)
    private(set) var pendingEntries: [Entry] = []
    private var sinks: [String: WeakLiveScoringSink] = [:]
    private var isFlushing = false

    struct Entry: Codable, Identifiable {
        var id: String { matchId }
        let gameId: String
        let matchId: String
        let body: WatchPatchLiveScoringBody
        let enqueuedAt: Date
    }

    private init() {
        load()
    }

    var pendingCount: Int { pendingEntries.count }

    func hasPending(forMatchId id: String) -> Bool {
        pendingEntries.contains { $0.matchId == id }
    }

    func pendingClientMessageId(forMatchId id: String) -> String? {
        pendingEntries.first { $0.matchId == id }?.body.clientMessageId
    }

    func hasPending(forGameId id: String) -> Bool {
        pendingEntries.contains { $0.gameId == id }
    }

    func registerSink(_ sink: any LiveScoringSessionSink) {
        sinks[sinkKey(gameId: sink.gameId, matchId: sink.matchId)] = WeakLiveScoringSink(sink)
    }

    func unregisterSink(gameId: String, matchId: String) {
        sinks.removeValue(forKey: sinkKey(gameId: gameId, matchId: matchId))
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

    /// Latest snapshot per match; flush retries preserve `clientMessageId` / `opId` until ACK.
    func enqueue(gameId: String, matchId: String, body: WatchPatchLiveScoringBody) {
        pendingEntries.removeAll { $0.matchId == matchId }
        pendingEntries.append(Entry(gameId: gameId, matchId: matchId, body: body, enqueuedAt: Date()))
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

    func flush(matchId: String? = nil) async {
        guard !isFlushing else { return }
        guard KeychainHelper.shared.readToken() != nil else { return }

        let queue = matchId.map { mid in pendingEntries.filter { $0.matchId == mid } } ?? pendingEntries
        guard !queue.isEmpty else { return }

        isFlushing = true
        defer { isFlushing = false }

        let api = APIClient()

        for entry in queue {
            guard pendingEntries.contains(where: { $0.matchId == entry.matchId }) else { continue }

            do {
                let response = try await api.patchMatchLiveScoring(
                    gameId: entry.gameId,
                    matchId: entry.matchId,
                    body: entry.body
                )
                if let envelope = response.liveScoring {
                    notifySink(entry: entry, envelope: envelope)
                }
                pendingEntries.removeAll { $0.matchId == entry.matchId }
                save()
                let revision = response.liveScoring?.revision ?? response.revision
                WatchSessionManager.shared.notifyScoreUpdated(
                    gameId: entry.gameId,
                    matchId: entry.matchId,
                    revision: revision
                )
                Self.log.debug("Live scoring outbox flushed matchId=\(entry.matchId, privacy: .public)")
            } catch let err as APIError {
                if case .liveScoringRevisionMismatch(_, let serverEnvelope) = err {
                    notifySink(entry: entry, envelope: serverEnvelope)
                    dropSuperseded(forMatchId: entry.matchId)
                    Self.log.debug("Live scoring outbox conflict matchId=\(entry.matchId, privacy: .public)")
                } else if APIError.warrantsDeliveryRetry(err) {
                    Self.log.error("Live scoring outbox keep matchId=\(entry.matchId, privacy: .public): \(err.localizedDescription, privacy: .public)")
                } else {
                    Self.log.error("Live scoring outbox drop matchId=\(entry.matchId, privacy: .public): \(err.localizedDescription, privacy: .public)")
                    remove(matchId: entry.matchId)
                }
            } catch {
                if APIError.warrantsDeliveryRetry(error) {
                    Self.log.error("Live scoring outbox keep matchId=\(entry.matchId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                } else {
                    Self.log.error("Live scoring outbox drop matchId=\(entry.matchId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                    remove(matchId: entry.matchId)
                }
            }
        }
    }

    private func dropSuperseded(forMatchId matchId: String) {
        pendingEntries.removeAll { $0.matchId == matchId }
        save()
    }

    private func sinkKey(gameId: String, matchId: String) -> String {
        "\(gameId)|\(matchId)"
    }

    private func notifySink(entry: Entry, envelope: WatchLiveScoringEnvelope?) {
        sinks[sinkKey(gameId: entry.gameId, matchId: entry.matchId)]?.value?
            .applyLiveScoringEnvelopeIfNewer(envelope)
    }
}
