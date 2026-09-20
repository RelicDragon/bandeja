import Foundation
import HealthKit

enum HealthKitPermissions {
    static let typesToShare: Set<HKSampleType> = [HKObjectType.workoutType()]
    static let typesToRead: Set<HKObjectType> = [
        HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
        HKObjectType.quantityType(forIdentifier: .heartRate)!,
        HKObjectType.workoutType(),
    ]

    static func requestAuthorization(store: HKHealthStore) async throws {
        try await store.requestAuthorization(toShare: typesToShare, read: typesToRead)
    }

    /// Sharing status for the workout type: `.notDetermined` (prompt never answered),
    /// `.sharingDenied` (user refused — only Settings can fix it) or `.sharingAuthorized`.
    static func authorizationStatus(store: HKHealthStore) -> HKAuthorizationStatus {
        store.authorizationStatus(for: HKObjectType.workoutType())
    }

    static func isSharingAuthorized(store: HKHealthStore) -> Bool {
        authorizationStatus(store: store) == .sharingAuthorized
    }
}
