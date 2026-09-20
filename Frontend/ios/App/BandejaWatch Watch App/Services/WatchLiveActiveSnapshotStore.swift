import Foundation
import WidgetKit
import BandejaWatchShared

enum WatchLiveActiveSnapshotStore {
    private static let widgetKind = "com.funified.bandeja.liveActiveMatch"
    /// Every point publishes a snapshot; WidgetKit reloads are budgeted, so coalesce them.
    private static let reloadInterval: TimeInterval = 15
    private static var lastReloadAt: Date = .distantPast
    private static var pendingReload: Task<Void, Never>?

    typealias Payload = LiveActiveSnapshotPayload

    static func publish(
        gameId: String,
        matchId: String,
        titleLine: String,
        scoreLine: String,
        sport: String? = nil
    ) {
        LiveActiveSnapshotStore.write(
            LiveActiveSnapshotPayload(
                gameId: gameId,
                matchId: matchId,
                titleLine: titleLine,
                scoreLine: scoreLine,
                sport: sport
            )
        )
        scheduleThrottledReload()
    }

    static func clear() {
        LiveActiveSnapshotStore.clear()
        pendingReload?.cancel()
        pendingReload = nil
        reloadNow()
    }

    static func readPayload() -> LiveActiveSnapshotPayload? {
        LiveActiveSnapshotStore.read()
    }

    private static func scheduleThrottledReload() {
        guard pendingReload == nil else { return }
        let elapsed = Date().timeIntervalSince(lastReloadAt)
        if elapsed >= reloadInterval {
            reloadNow()
            return
        }
        let delay = reloadInterval - elapsed
        pendingReload = Task { @MainActor in
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled else { return }
            pendingReload = nil
            reloadNow()
        }
    }

    private static func reloadNow() {
        lastReloadAt = Date()
        WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
    }
}
