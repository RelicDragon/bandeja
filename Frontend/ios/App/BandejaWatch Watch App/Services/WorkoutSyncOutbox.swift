import Foundation
import Network
import Observation
import os

/// Persisted workout summary uploads when the API fails after Apple Health already saved the workout.
@Observable
@MainActor
final class WorkoutSyncOutbox {
    static let shared = WorkoutSyncOutbox()

    private static let udKey = "bandeja.workout.outbox.v1"
    private static let log = Logger(subsystem: Bundle.main.bundleIdentifier ?? "BandejaWatch", category: "WorkoutOutbox")

    private let ud = UserDefaults(suiteName: KeychainHelper.accessGroup)
    private(set) var pendingEntries: [OutboxEntry] = []

    private init() {
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
    func enqueue(_ entry: OutboxEntry) {
        pendingEntries.removeAll { $0.gameId == entry.gameId }
        pendingEntries.append(entry)
        save()
    }

    func remove(gameId: String) {
        pendingEntries.removeAll { $0.gameId == gameId }
        save()
    }

    func flush() async {
        guard KeychainHelper.shared.readToken() != nil else { return }
        guard !pendingEntries.isEmpty else { return }

        let api = APIClient()
        var remaining: [OutboxEntry] = []

        for entry in pendingEntries {
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
                Self.log.error("Outbox flush failed gameId=\(entry.gameId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                remaining.append(entry)
            }
        }

        pendingEntries = remaining
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

@MainActor
final class WorkoutOutboxNetworkMonitor {
    static let shared = WorkoutOutboxNetworkMonitor()

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "bandeja.watch.outbox.network")

    func start() {
        monitor.pathUpdateHandler = { path in
            guard path.status == .satisfied else { return }
            Task { @MainActor in
                await WorkoutSyncOutbox.shared.flush()
            }
        }
        monitor.start(queue: queue)
    }
}
