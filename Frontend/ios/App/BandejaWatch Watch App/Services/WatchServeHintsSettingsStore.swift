import Foundation
import Observation

@Observable
@MainActor
final class WatchServeHintsSettingsStore {
    static let shared = WatchServeHintsSettingsStore()

    private static let key = "bandeja.watch.serveHintsMode.v1"

    private(set) var mode: WatchServeHintsMode

    private init() {
        if let raw = UserDefaults.standard.string(forKey: Self.key),
           let m = WatchServeHintsMode(rawValue: raw) {
            mode = m
        } else {
            mode = .on
        }
    }

    func setMode(_ next: WatchServeHintsMode) {
        mode = next
        UserDefaults.standard.set(next.rawValue, forKey: Self.key)
    }
}
