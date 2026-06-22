import Foundation
import Observation
import os

enum NetworkDeliveryOperation: Codable {
    case livePatch(body: WatchPatchLiveScoringBody)
    case matchPut(teamA: [String], teamB: [String], sets: [WatchSetWrite])
}

struct NetworkDeliveryEntry: Codable, Identifiable {
    let gameId: String
    let matchId: String
    let operation: NetworkDeliveryOperation
    let enqueuedAt: Date

    var id: String {
        switch operation {
        case .livePatch: "live|\(matchId)"
        case .matchPut: "put|\(matchId)"
        }
    }

    var isLivePatch: Bool {
        if case .livePatch = operation { return true }
        return false
    }
}

enum NetworkDeliveryFlushOrder {
    static func ordered(_ entries: [NetworkDeliveryEntry], matchId: String?) -> [NetworkDeliveryEntry] {
        let filtered = matchId.map { mid in entries.filter { $0.matchId == mid } } ?? entries
        return filtered.sorted { lhs, rhs in
            if lhs.isLivePatch != rhs.isLivePatch {
                return lhs.isLivePatch
            }
            if lhs.matchId != rhs.matchId {
                return lhs.matchId < rhs.matchId
            }
            return lhs.enqueuedAt < rhs.enqueuedAt
        }
    }
}

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
final class NetworkDeliveryOutbox {
    static let shared = NetworkDeliveryOutbox()

    private static let udKey = "bandeja.networkDelivery.outbox.v1"
    private static let legacyLiveKey = "bandeja.liveScoring.outbox.v1"
    private static let legacyMatchKey = "bandeja.scoring.outbox.v1"
    private static let log = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "BandejaWatch",
        category: "NetworkDeliveryOutbox"
    )

    typealias Entry = NetworkDeliveryEntry

    private let ud = UserDefaults(suiteName: KeychainHelper.accessGroup)
    private(set) var pendingEntries: [NetworkDeliveryEntry] = []
    private var sinks: [String: WeakLiveScoringSink] = [:]
    private var isFlushing = false
    private var needsFollowUpFlush = false

    private init() {
        load()
        migrateLegacyOutboxesIfNeeded()
    }

    var pendingCount: Int { pendingEntries.count }

    func hasPending(forMatchId id: String) -> Bool {
        pendingEntries.contains { $0.matchId == id }
    }

    func hasPendingMatchPut(forMatchId id: String) -> Bool {
        pendingEntries.contains { $0.matchId == id && !$0.isLivePatch }
    }

    func hasPending(forGameId id: String) -> Bool {
        pendingEntries.contains { $0.gameId == id && !$0.isLivePatch }
    }

    func pendingClientMessageId(forMatchId id: String) -> String? {
        guard let entry = pendingEntries.first(where: { $0.matchId == id && $0.isLivePatch }),
              case .livePatch(let body) = entry.operation else {
            return nil
        }
        return body.clientMessageId
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

    func enqueueLivePatch(gameId: String, matchId: String, body: WatchPatchLiveScoringBody) {
        pendingEntries.removeAll { $0.matchId == matchId && $0.isLivePatch }
        pendingEntries.append(
            NetworkDeliveryEntry(
                gameId: gameId,
                matchId: matchId,
                operation: .livePatch(body: body),
                enqueuedAt: Date()
            )
        )
        save()
    }

    func enqueueMatchPut(
        gameId: String,
        matchId: String,
        teamA: [String],
        teamB: [String],
        sets: [WatchSetWrite]
    ) {
        pendingEntries.removeAll { $0.matchId == matchId && !$0.isLivePatch }
        pendingEntries.append(
            NetworkDeliveryEntry(
                gameId: gameId,
                matchId: matchId,
                operation: .matchPut(teamA: teamA, teamB: teamB, sets: sets),
                enqueuedAt: Date()
            )
        )
        save()
    }

    func removeLivePatch(matchId: String) {
        pendingEntries.removeAll { $0.matchId == matchId && $0.isLivePatch }
        save()
    }

    func removeMatchPut(matchId: String) {
        pendingEntries.removeAll { $0.matchId == matchId && !$0.isLivePatch }
        save()
    }

    func clear() {
        pendingEntries = []
        ud?.removeObject(forKey: Self.udKey)
        ud?.removeObject(forKey: Self.legacyLiveKey)
        ud?.removeObject(forKey: Self.legacyMatchKey)
    }

    func flush(matchId: String? = nil) async {
        if isFlushing {
            needsFollowUpFlush = true
            return
        }
        guard KeychainHelper.shared.readToken() != nil else { return }

        let queue = NetworkDeliveryFlushOrder.ordered(pendingEntries, matchId: matchId)
        guard !queue.isEmpty else { return }

        isFlushing = true
        defer {
            isFlushing = false
            if needsFollowUpFlush {
                needsFollowUpFlush = false
                Task { await flush() }
            }
        }

        let api = APIClient()

        for entry in queue {
            guard pendingEntries.contains(where: { $0.id == entry.id }) else { continue }

            switch entry.operation {
            case .livePatch(let body):
                await flushLivePatch(entry: entry, body: body, api: api)
            case .matchPut(let teamA, let teamB, let sets):
                await flushMatchPut(entry: entry, teamA: teamA, teamB: teamB, sets: sets, api: api)
            }
        }
    }

    private func flushLivePatch(
        entry: NetworkDeliveryEntry,
        body: WatchPatchLiveScoringBody,
        api: APIClient
    ) async {
        do {
            let response = try await api.patchMatchLiveScoring(
                gameId: entry.gameId,
                matchId: entry.matchId,
                body: body
            )
            if let envelope = response.liveScoring {
                notifySink(entry: entry, envelope: envelope)
            }
            removeLivePatch(matchId: entry.matchId)
            let revision = response.liveScoring?.revision ?? response.revision
            WatchSessionManager.shared.notifyScoreUpdated(
                gameId: entry.gameId,
                matchId: entry.matchId,
                revision: revision
            )
            Self.log.debug("Live patch flushed matchId=\(entry.matchId, privacy: .public)")
        } catch let err as APIError {
            if case .liveScoringRevisionMismatch(_, let serverEnvelope) = err {
                notifySink(entry: entry, envelope: serverEnvelope)
                removeLivePatch(matchId: entry.matchId)
                Self.log.debug("Live patch conflict matchId=\(entry.matchId, privacy: .public)")
            } else if APIError.warrantsDeliveryRetry(err) {
                Self.log.error(
                    "Live patch keep matchId=\(entry.matchId, privacy: .public): \(err.localizedDescription, privacy: .public)"
                )
            } else {
                Self.log.error(
                    "Live patch drop matchId=\(entry.matchId, privacy: .public): \(err.localizedDescription, privacy: .public)"
                )
                removeLivePatch(matchId: entry.matchId)
            }
        } catch {
            if APIError.warrantsDeliveryRetry(error) {
                Self.log.error(
                    "Live patch keep matchId=\(entry.matchId, privacy: .public): \(error.localizedDescription, privacy: .public)"
                )
            } else {
                Self.log.error(
                    "Live patch drop matchId=\(entry.matchId, privacy: .public): \(error.localizedDescription, privacy: .public)"
                )
                removeLivePatch(matchId: entry.matchId)
            }
        }
    }

    private func flushMatchPut(
        entry: NetworkDeliveryEntry,
        teamA: [String],
        teamB: [String],
        sets: [WatchSetWrite],
        api: APIClient
    ) async {
        let body = WatchUpdateMatchBody(teamA: teamA, teamB: teamB, sets: sets)
        do {
            try await api.sendVoid(.updateMatch(gameId: entry.gameId, matchId: entry.matchId), body: body)
            removeMatchPut(matchId: entry.matchId)
            WatchSessionManager.shared.notifyScoreUpdated(
                gameId: entry.gameId,
                matchId: entry.matchId
            )
            Self.log.debug("Match PUT flushed matchId=\(entry.matchId, privacy: .public)")
        } catch {
            if APIError.warrantsDeliveryRetry(error) {
                Self.log.error(
                    "Match PUT keep matchId=\(entry.matchId, privacy: .public): \(error.localizedDescription, privacy: .public)"
                )
            } else {
                Self.log.error(
                    "Match PUT drop matchId=\(entry.matchId, privacy: .public): \(error.localizedDescription, privacy: .public)"
                )
                removeMatchPut(matchId: entry.matchId)
            }
        }
    }

    private func migrateLegacyOutboxesIfNeeded() {
        var migrated = pendingEntries
        var didMigrate = false

        if let data = ud?.data(forKey: Self.legacyLiveKey),
           let legacy = try? JSONDecoder().decode([LegacyLiveScoringEntry].self, from: data) {
            for item in legacy {
                migrated.removeAll { $0.matchId == item.matchId && $0.isLivePatch }
                migrated.append(
                    NetworkDeliveryEntry(
                        gameId: item.gameId,
                        matchId: item.matchId,
                        operation: .livePatch(body: item.body),
                        enqueuedAt: item.enqueuedAt
                    )
                )
            }
            ud?.removeObject(forKey: Self.legacyLiveKey)
            didMigrate = true
        }

        if let data = ud?.data(forKey: Self.legacyMatchKey),
           let legacy = try? JSONDecoder().decode([LegacyMatchPutEntry].self, from: data) {
            for item in legacy {
                migrated.removeAll { $0.matchId == item.matchId && !$0.isLivePatch }
                migrated.append(
                    NetworkDeliveryEntry(
                        gameId: item.gameId,
                        matchId: item.matchId,
                        operation: .matchPut(teamA: item.teamA, teamB: item.teamB, sets: item.sets),
                        enqueuedAt: item.enqueuedAt
                    )
                )
            }
            ud?.removeObject(forKey: Self.legacyMatchKey)
            didMigrate = true
        }

        guard didMigrate else { return }
        pendingEntries = migrated
        save()
    }

    private func sinkKey(gameId: String, matchId: String) -> String {
        "\(gameId)|\(matchId)"
    }

    private func notifySink(entry: NetworkDeliveryEntry, envelope: WatchLiveScoringEnvelope?) {
        sinks[sinkKey(gameId: entry.gameId, matchId: entry.matchId)]?.value?
            .applyLiveScoringEnvelopeIfNewer(envelope)
    }
}

private struct LegacyLiveScoringEntry: Codable {
    let gameId: String
    let matchId: String
    let body: WatchPatchLiveScoringBody
    let enqueuedAt: Date
}

private struct LegacyMatchPutEntry: Codable {
    let gameId: String
    let matchId: String
    let teamA: [String]
    let teamB: [String]
    let sets: [WatchSetWrite]
    let enqueuedAt: Date
}
