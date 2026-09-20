import Foundation
import Observation
import os

/// Persisted workout summary uploads when the API fails after Apple Health already saved the workout.
///
/// Entries are bound to the user who recorded them (`ownerUserId`): after a logout / account
/// switch the queue is cleared, and any leftover row from another user is dropped at flush time
/// instead of being POSTed under the wrong account.
@Observable
@MainActor
final class WorkoutSyncOutbox {
    static let shared = WorkoutSyncOutbox()

    private static let udKey = "bandeja.workout.outbox.v1"
    private static let log = Logger(subsystem: Bundle.main.bundleIdentifier ?? "BandejaWatch", category: "WorkoutOutbox")

    private let ud: UserDefaults?
    private let currentUserIdProvider: @MainActor () -> String?
    private(set) var pendingEntries: [OutboxEntry] = []
    private var isFlushing = false

    private init() {
        self.ud = UserDefaults(suiteName: KeychainHelper.accessGroup)
        self.currentUserIdProvider = { KeychainHelper.shared.readUserId() }
        load()
    }

    /// Test seam: isolated suite + injectable "who is signed in".
    init(suite: UserDefaults?, currentUserId: @escaping @MainActor () -> String?) {
        self.ud = suite
        self.currentUserIdProvider = currentUserId
        load()
    }

    struct OutboxEntry: Codable, Equatable, Identifiable {
        var id: String { gameId }
        let gameId: String
        let durationSeconds: Int
        let totalEnergyKcal: Double?
        let avgHeartRate: Double?
        let maxHeartRate: Double?
        let startedAt: String
        let endedAt: String
        let source: String
        let healthExternalId: String?
        let enqueuedAt: Date
        /// User the workout belongs to. `nil` only for rows written by builds that predate
        /// owner binding; those are adopted by the current user once (see `flush`).
        var ownerUserId: String?

        init(
            gameId: String,
            durationSeconds: Int,
            totalEnergyKcal: Double?,
            avgHeartRate: Double?,
            maxHeartRate: Double?,
            startedAt: String,
            endedAt: String,
            source: String,
            healthExternalId: String?,
            enqueuedAt: Date,
            ownerUserId: String? = nil
        ) {
            self.gameId = gameId
            self.durationSeconds = durationSeconds
            self.totalEnergyKcal = totalEnergyKcal
            self.avgHeartRate = avgHeartRate
            self.maxHeartRate = maxHeartRate
            self.startedAt = startedAt
            self.endedAt = endedAt
            self.source = source
            self.healthExternalId = healthExternalId
            self.enqueuedAt = enqueuedAt
            self.ownerUserId = ownerUserId
        }
    }

    /// What `flush` should do with each persisted row for the signed-in user.
    enum OwnerFilter: Equatable {
        /// Row already belongs to `currentUserId`.
        case send
        /// Legacy row without an owner: stamp it with `currentUserId`, then send.
        case adopt
        /// Row belongs to somebody else: drop without sending.
        case drop
    }

    nonisolated static func ownerFilter(for entry: OutboxEntry, currentUserId: String) -> OwnerFilter {
        guard let owner = entry.ownerUserId else { return .adopt }
        return owner == currentUserId ? .send : .drop
    }

    /// Keep the row for a later retry only on transient failures; 4xx (except 408/429),
    /// decoding errors and missing credentials are poison and are dropped.
    nonisolated static func shouldKeepAfterFailure(_ error: Error) -> Bool {
        APIError.warrantsDeliveryRetry(error)
    }

    var pendingCount: Int { pendingEntries.count }

    func hasPending(forGameId id: String) -> Bool {
        pendingEntries.contains { $0.gameId == id }
    }

    func load() {
        guard let data = ud?.data(forKey: Self.udKey),
              let decoded = try? JSONDecoder().decode([OutboxEntry].self, from: data) else {
            pendingEntries = []
            return
        }
        pendingEntries = decoded
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(pendingEntries) else { return }
        ud?.set(data, forKey: Self.udKey)
    }

    /// Replace any existing row for the same game (latest payload wins).
    /// Rows enqueued without an owner are bound to the signed-in user.
    func enqueue(_ entry: OutboxEntry) {
        var bound = entry
        if bound.ownerUserId == nil {
            bound.ownerUserId = currentUserIdProvider()
        }
        pendingEntries.removeAll { $0.gameId == bound.gameId }
        pendingEntries.append(bound)
        save()
    }

    func remove(gameId: String) {
        pendingEntries.removeAll { $0.gameId == gameId }
        save()
    }

    /// Logout: nothing in the queue may be delivered under the next account.
    func clear() {
        pendingEntries = []
        ud?.removeObject(forKey: Self.udKey)
    }

    func flush() async {
        guard !isFlushing else { return }
        guard !pendingEntries.isEmpty else { return }
        guard await APIClient.ensureAccessToken() != nil else { return }
        guard let currentUserId = currentUserIdProvider() else { return }

        isFlushing = true
        defer { isFlushing = false }

        let api = APIClient()
        let snapshot = pendingEntries
        var remaining: [OutboxEntry] = []

        for var entry in snapshot {
            switch Self.ownerFilter(for: entry, currentUserId: currentUserId) {
            case .drop:
                Self.log.error("Outbox drop gameId=\(entry.gameId, privacy: .public): owned by another user")
                continue
            case .adopt:
                entry.ownerUserId = currentUserId
            case .send:
                break
            }

            let body = WorkoutOutboxUploadBody(
                durationSeconds: entry.durationSeconds,
                totalEnergyKcal: entry.totalEnergyKcal,
                avgHeartRate: entry.avgHeartRate,
                maxHeartRate: entry.maxHeartRate,
                startedAt: entry.startedAt,
                endedAt: entry.endedAt,
                source: entry.source,
                healthExternalId: entry.healthExternalId
            )
            do {
                let _: WorkoutOutboxUpsertResponse = try await api.send(Endpoint.postGameWorkout(gameId: entry.gameId), body: body)
                Self.log.debug("Outbox flushed gameId=\(entry.gameId, privacy: .public)")
            } catch {
                if Self.shouldKeepAfterFailure(error) {
                    Self.log.error("Outbox keep gameId=\(entry.gameId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                    remaining.append(entry)
                } else {
                    Self.log.error("Outbox drop gameId=\(entry.gameId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                }
            }
        }

        // Rows added or removed while we were awaiting the network win over our stale copy.
        let stillWanted = remaining.filter { r in pendingEntries.contains { $0.gameId == r.gameId } }
        let addedMeanwhile = pendingEntries.filter { p in !snapshot.contains { $0.gameId == p.gameId } }
        pendingEntries = stillWanted + addedMeanwhile
        save()
    }
}

private struct WorkoutOutboxUploadBody: Encodable, Sendable {
    let durationSeconds: Int
    let totalEnergyKcal: Double?
    let avgHeartRate: Double?
    let maxHeartRate: Double?
    let startedAt: String
    let endedAt: String
    let source: String
    let healthExternalId: String?
}

private struct WorkoutOutboxUpsertResponse: Decodable, Sendable {
    let id: String
}
