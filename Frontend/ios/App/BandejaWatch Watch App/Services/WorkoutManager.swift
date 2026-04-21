import Foundation
import HealthKit
import Observation
import os

private struct WorkoutUploadBody: Encodable, Sendable {
    let durationSeconds: Int
    let totalEnergyKcal: Double?
    let avgHeartRate: Double?
    let maxHeartRate: Double?
    let startedAt: String
    let endedAt: String
    let source: String
    let healthExternalId: String?
}

@Observable
@MainActor
final class WorkoutManager: NSObject, HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate {
    static let shared = WorkoutManager()

    private static let log = Logger(subsystem: Bundle.main.bundleIdentifier ?? "BandejaWatch", category: "Workout")

    private let healthStore = HKHealthStore()
    private let ud = UserDefaults(suiteName: KeychainHelper.accessGroup)
    private static let activeGameIdKey = "bandeja.hk.activeGameId"

    var isActive = false
    var authDenied = false
    var sessionState: HKWorkoutSessionState = .notStarted
    var activeCalories: Double = 0
    var heartRate: Double = 0
    var maxHeartRateTracked: Double = 0
    var elapsedSeconds: TimeInterval = 0
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private(set) var activeGameId: String?
    private var workoutStartDate: Date?

    private static let isoEncoder: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private override init() {
        super.init()
    }

    func recoverIfNeeded() async {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        do {
            guard let recovered = try await healthStore.recoverActiveWorkoutSession() else {
                ud?.removeObject(forKey: Self.activeGameIdKey)
                return
            }
            session = recovered
            let b = recovered.associatedWorkoutBuilder()
            builder = b
            recovered.delegate = self
            b.delegate = self
            activeGameId = ud?.string(forKey: Self.activeGameIdKey)
            workoutStartDate = recovered.startDate
            sessionState = recovered.state
            elapsedSeconds = b.elapsedTime
            isActive = true
            authDenied = false
        } catch {
            Self.log.error("recoverActiveWorkoutSession failed: \(error.localizedDescription, privacy: .public)")
            ud?.removeObject(forKey: Self.activeGameIdKey)
        }
    }

    func startIfNeeded(gameId: String, isIndoor: Bool) async {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        if isActive, activeGameId == gameId {
            if let s = session { sessionState = s.state }
            if let b = builder { elapsedSeconds = b.elapsedTime }
            return
        }
        if isActive, activeGameId != gameId {
            await discardWorkout()
        }

        do {
            try await HealthKitPermissions.requestAuthorization(store: healthStore)
        } catch {
            authDenied = true
            return
        }

        if !HealthKitPermissions.isSharingAuthorized(store: healthStore) {
            authDenied = true
            return
        }
        authDenied = false

        let config = HKWorkoutConfiguration()
        config.activityType = .paddleSports
        config.locationType = isIndoor ? .indoor : .outdoor

        do {
            let newSession = try HKWorkoutSession(healthStore: healthStore, configuration: config)
            let newBuilder = newSession.associatedWorkoutBuilder()
            newBuilder.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: config)
            newSession.delegate = self
            newBuilder.delegate = self

            let start = Date()
            workoutStartDate = start
            newSession.startActivity(with: start)
            try await newBuilder.beginCollection(at: start)
            try? await newSession.startMirroringToCompanionDevice()

            session = newSession
            builder = newBuilder
            activeGameId = gameId
            ud?.set(gameId, forKey: Self.activeGameIdKey)
            sessionState = newSession.state
            isActive = true
            activeCalories = 0
            heartRate = 0
            maxHeartRateTracked = 0
            elapsedSeconds = newBuilder.elapsedTime
        } catch {
            Self.log.error("startIfNeeded failed: \(error.localizedDescription, privacy: .public)")
            session = nil
            builder = nil
            activeGameId = nil
            workoutStartDate = nil
            isActive = false
            sessionState = .notStarted
            ud?.removeObject(forKey: Self.activeGameIdKey)
        }
    }

    func discardIfStillActive(gameId: String) async {
        guard activeGameId == gameId, isActive else { return }
        await discardWorkout()
    }

    func togglePauseResume() {
        guard let session, isActive else { return }
        switch session.state {
        case .running:
            session.pause()
            Task { await MatchTimerWorkoutBridge.notifyWorkoutPaused() }
        case .paused:
            session.resume()
            Task { await MatchTimerWorkoutBridge.notifyWorkoutResumed() }
        default:
            break
        }
    }

    func autoPause() {
        guard let session, isActive, session.state == .running else { return }
        session.pause()
        Task { await MatchTimerWorkoutBridge.notifyWorkoutPaused() }
    }

    func autoResume() {
        guard let session, isActive, session.state == .paused else { return }
        session.resume()
        Task { await MatchTimerWorkoutBridge.notifyWorkoutResumed() }
    }

    /// After results are finalized on the server: save HK workout and upload summary.
    func endSessionUploadAndClear(gameId: String) async {
        guard activeGameId == gameId, isActive, let session, let builder else {
            ud?.removeObject(forKey: Self.activeGameIdKey)
            return
        }

        let end = Date()
        session.stopActivity(with: end)

        do {
            try await builder.endCollection(at: end)
            try await builder.addMetadata([HKMetadataKeyExternalUUID: gameId])
            guard let workout = try await builder.finishWorkout() else {
                throw NSError(domain: "WorkoutManager", code: 1)
            }

            let startDate = workout.startDate
            let endDate = workout.endDate
            let durationSeconds = max(1, Int(floor(endDate.timeIntervalSince(startDate))))
            let energyType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!
            let kcal = workout.statistics(for: energyType)?.sumQuantity()?.doubleValue(for: .kilocalorie())

            let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate)!
            let hrStats = workout.statistics(for: hrType)
            let avgHR = hrStats?.averageQuantity()?.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
            let maxHR = hrStats?.maximumQuantity()?.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
            let maxFallback = maxHR ?? (maxHeartRateTracked > 0 ? maxHeartRateTracked : nil)
            let avgFallback = avgHR ?? (heartRate > 0 ? heartRate : nil)

            let body = WorkoutUploadBody(
                durationSeconds: durationSeconds,
                totalEnergyKcal: kcal,
                avgHeartRate: avgFallback,
                maxHeartRate: maxFallback,
                startedAt: Self.isoEncoder.string(from: startDate),
                endedAt: Self.isoEncoder.string(from: endDate),
                source: "APPLE_WATCH",
                healthExternalId: workout.uuid.uuidString
            )
            await uploadSummaryWithRetries(gameId: gameId, body: body)
        } catch {
            Self.log.error("endSession HealthKit pipeline failed: \(error.localizedDescription, privacy: .public)")
        }

        clearStateAfterSession()
    }

    private func uploadSummaryWithRetries(gameId: String, body: WorkoutUploadBody) async {
        let maxAttempts = 3
        for attempt in 1...maxAttempts {
            do {
                try await uploadSummary(gameId: gameId, body: body)
                WorkoutSyncOutbox.shared.remove(gameId: gameId)
                return
            } catch {
                Self.log.error("Workout upload attempt \(attempt)/\(maxAttempts) failed: \(error.localizedDescription, privacy: .public)")
                if attempt < maxAttempts {
                    try? await Task.sleep(for: .milliseconds(350 * attempt))
                }
            }
        }
        WorkoutSyncOutbox.shared.enqueue(
            WorkoutSyncOutbox.OutboxEntry(
                gameId: gameId,
                durationSeconds: body.durationSeconds,
                totalEnergyKcal: body.totalEnergyKcal,
                avgHeartRate: body.avgHeartRate,
                maxHeartRate: body.maxHeartRate,
                startedAt: body.startedAt,
                endedAt: body.endedAt,
                source: body.source,
                healthExternalId: body.healthExternalId,
                enqueuedAt: Date()
            )
        )
    }

    private func uploadSummary(gameId: String, body: WorkoutUploadBody) async throws {
        let api = APIClient()
        let _: WorkoutUpsertData = try await api.send(Endpoint.postGameWorkout(gameId: gameId), body: body)
    }

    private func clearStateAfterSession() {
        session = nil
        builder = nil
        activeGameId = nil
        workoutStartDate = nil
        isActive = false
        activeCalories = 0
        heartRate = 0
        maxHeartRateTracked = 0
        elapsedSeconds = 0
        sessionState = .notStarted
        ud?.removeObject(forKey: Self.activeGameIdKey)
    }

    private func discardWorkout() async {
        guard let session, let builder else {
            clearStateAfterSession()
            return
        }
        let end = Date()
        session.stopActivity(with: end)
        do {
            try await builder.endCollection(at: end)
            builder.discardWorkout()
        } catch {
            Self.log.error("discardWorkout failed: \(error.localizedDescription, privacy: .public)")
        }
        clearStateAfterSession()
    }

    // MARK: - HKLiveWorkoutBuilderDelegate

    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf types: Set<HKSampleType>) {
        Task { @MainActor in
            guard let b = self.builder, ObjectIdentifier(b) == ObjectIdentifier(workoutBuilder) else { return }
            if let t = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned),
               let s = workoutBuilder.statistics(for: t) {
                activeCalories = s.sumQuantity()?.doubleValue(for: .kilocalorie()) ?? 0
            }
            if let t = HKObjectType.quantityType(forIdentifier: .heartRate),
               let s = workoutBuilder.statistics(for: t),
               let q = s.mostRecentQuantity() {
                let bpm = q.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
                heartRate = bpm
                maxHeartRateTracked = max(maxHeartRateTracked, bpm)
            }
            elapsedSeconds = workoutBuilder.elapsedTime
        }
    }

    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    // MARK: - HKWorkoutSessionDelegate

    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        Task { @MainActor in
            guard let s = self.session, ObjectIdentifier(s) == ObjectIdentifier(workoutSession) else { return }
            sessionState = toState
            if let b = builder {
                elapsedSeconds = b.elapsedTime
            }
        }
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        Task { @MainActor in
            if let s = self.session, ObjectIdentifier(s) == ObjectIdentifier(workoutSession) {
                Self.log.error("HKWorkoutSession failed: \(error.localizedDescription, privacy: .public)")
                self.clearStateAfterSession()
            }
        }
    }
}

private struct WorkoutUpsertData: Decodable, Sendable {
    let id: String
}
