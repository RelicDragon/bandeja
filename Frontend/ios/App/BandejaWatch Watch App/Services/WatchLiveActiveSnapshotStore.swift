import Foundation
import WidgetKit
import BandejaWatchShared

enum WatchLiveActiveSnapshotStore {
    private static let widgetKind = "com.funified.bandeja.liveActiveMatch"

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
        WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
    }

    static func clear() {
        LiveActiveSnapshotStore.clear()
        WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
    }

    static func readPayload() -> LiveActiveSnapshotPayload? {
        LiveActiveSnapshotStore.read()
    }
}
