import Foundation
import HealthKit

enum HealthKitPermissions {
    static let typesToShare: Set<HKSampleType> = [HKObjectType.workoutType()]
    static let typesToRead: Set<HKObjectType> = [
        HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
        HKObjectType.quantityType(forIdentifier: .heartRate)!,
        HKObjectType.quantityType(forIdentifier: .basalEnergyBurned)!,
        HKObjectType.workoutType(),
    ]

    static func requestAuthorization(store: HKHealthStore) async throws {
        try await store.requestAuthorization(toShare: typesToShare, read: typesToRead)
    }

    static func isSharingAuthorized(store: HKHealthStore) -> Bool {
        store.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized
    }
}
