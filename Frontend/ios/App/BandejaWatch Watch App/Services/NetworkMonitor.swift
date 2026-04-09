import Foundation
import Network
import Observation

@Observable
@MainActor
final class NetworkMonitor {
    static let shared = NetworkMonitor()

    /// Do not drive “offline” UI on watchOS: `NWPathMonitor` often reports unsatisfied when traffic goes via the paired iPhone.
    private(set) var isConnected = true

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "bandeja.watch.network")
    private var didStart = false

    private init() {}

    func start() {
        guard !didStart else { return }
        didStart = true
        monitor.pathUpdateHandler = { [weak self] path in
            let connected = path.status == .satisfied
            Task { @MainActor [weak self] in
                guard let self else { return }
                let wasConnected = self.isConnected
                self.isConnected = connected
                if connected, !wasConnected {
                    await ScoringOutbox.shared.flush()
                    await WorkoutSyncOutbox.shared.flush()
                }
            }
        }
        monitor.start(queue: queue)
    }
}
