import Foundation
import Network
import UserNotifications

/// PRD 345 / 357 — posts a signed shade answer when the webview is not up.
///
/// The JS layer handles the same actions whenever it is alive (it can also
/// refresh the open screen); this is the cold-start path, mirroring how
/// `AttendanceActionHandler` backs the reminder and `ChatReplyHandler` backs the
/// inline reply.
enum TokenActionHandler {
    private static let answerQueue = DispatchQueue(
        label: "com.funified.bandeja.token-action",
        qos: .userInitiated
    )

    static func shouldHandleNatively(
        response: UNNotificationResponse,
        jsReady: Bool
    ) -> Bool {
        guard !jsReady else { return false }
        return TokenActionPushData.from(
            userInfo: response.notification.request.content.userInfo,
            actionIdentifier: response.actionIdentifier
        ) != nil
    }

    static func handle(
        response: UNNotificationResponse,
        completion: @escaping () -> Void
    ) {
        guard let pushData = TokenActionPushData.from(
            userInfo: response.notification.request.content.userInfo,
            actionIdentifier: response.actionIdentifier
        ) else {
            completion()
            return
        }

        answerQueue.async {
            defer { DispatchQueue.main.async { completion() } }

            // Both answers remain available in the app, so a failed post simply
            // stays unanswered — never surface an error the player must act on.
            guard isOnline() else { return }

            let result = ChatReplyApiClient.performPushAction(actionToken: pushData.actionToken)
            guard result.success, let ack = pushData.acknowledgement else { return }
            showAcknowledgement(ack, type: pushData.type, gameId: pushData.gameId)
        }
    }

    private static func isOnline() -> Bool {
        let monitor = NWPathMonitor()
        let semaphore = DispatchSemaphore(value: 0)
        var online = false
        monitor.pathUpdateHandler = { path in
            online = path.status == .satisfied
            semaphore.signal()
            monitor.cancel()
        }
        let queue = DispatchQueue(label: "com.funified.bandeja.token-action-reachability")
        monitor.start(queue: queue)
        _ = semaphore.wait(timeout: .now() + 1)
        monitor.cancel()
        return online
    }

    private static func showAcknowledgement(_ text: String, type: String, gameId: String) {
        DispatchQueue.main.async {
            let content = UNMutableNotificationContent()
            content.body = text
            content.userInfo = ["type": type, "data": ["gameId": gameId]]

            let request = UNNotificationRequest(
                identifier: "token-action-ack-\(type)-\(gameId)",
                content: content,
                trigger: nil
            )
            UNUserNotificationCenter.current().add(request)
        }
    }
}
