import Foundation
import Network
import UserNotifications

/// PRD 346 — answers the reminder from the shade when the webview is not up.
///
/// The JS layer handles the same two actions whenever it is alive (it can also
/// refresh the open game details); this is the cold-start path, mirroring how
/// `ChatReplyHandler` backs the inline chat reply.
enum AttendanceActionHandler {
    private static let answerQueue = DispatchQueue(
        label: "com.funified.bandeja.attendance-answer",
        qos: .userInitiated
    )

    static func shouldHandleNatively(
        response: UNNotificationResponse,
        jsReady: Bool
    ) -> Bool {
        guard !jsReady else { return false }
        guard AttendancePushData.Answer(actionIdentifier: response.actionIdentifier) != nil else {
            return false
        }
        return AttendancePushData.from(userInfo: response.notification.request.content.userInfo) != nil
    }

    static func handle(
        response: UNNotificationResponse,
        completion: @escaping () -> Void
    ) {
        guard let answer = AttendancePushData.Answer(actionIdentifier: response.actionIdentifier),
              let pushData = AttendancePushData.from(
                  userInfo: response.notification.request.content.userInfo
              ) else {
            completion()
            return
        }

        answerQueue.async {
            defer { DispatchQueue.main.async { completion() } }

            // No deadline exists, so a failed answer simply stays unanswered —
            // never surface an error the player has to act on.
            guard isOnline() else { return }

            let result = ChatReplyApiClient.performPushAction(
                actionToken: pushData.actionToken(for: answer)
            )
            guard result.success, let ack = pushData.acknowledgement(for: answer) else { return }
            showAcknowledgement(ack, gameId: pushData.gameId)
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
        let queue = DispatchQueue(label: "com.funified.bandeja.attendance-reachability")
        monitor.start(queue: queue)
        _ = semaphore.wait(timeout: .now() + 1)
        monitor.cancel()
        return online
    }

    private static func showAcknowledgement(_ text: String, gameId: String) {
        DispatchQueue.main.async {
            let content = UNMutableNotificationContent()
            content.body = text
            content.userInfo = ["type": "GAME_REMINDER", "data": ["gameId": gameId]]

            let request = UNNotificationRequest(
                identifier: "attendance-ack-\(gameId)",
                content: content,
                trigger: nil
            )
            UNUserNotificationCenter.current().add(request)
        }
    }
}
