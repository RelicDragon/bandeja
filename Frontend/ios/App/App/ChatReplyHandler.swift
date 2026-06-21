import Foundation
import Network
import UIKit
import UserNotifications

enum ChatReplyHandler {
    private static let replyQueue = DispatchQueue(label: "com.funified.bandeja.chat-reply", qos: .userInitiated)

    static func shouldHandleNatively(
        response: UNNotificationResponse,
        jsReady: Bool
    ) -> Bool {
        guard !jsReady else { return false }
        guard response is UNTextInputNotificationResponse else { return false }
        guard response.actionIdentifier != UNNotificationDefaultActionIdentifier,
              response.actionIdentifier != UNNotificationDismissActionIdentifier else {
            return false
        }

        let userInfo = response.notification.request.content.userInfo
        guard let pushData = ChatPushData.from(userInfo: userInfo),
              pushData.replyToken != nil else {
            return false
        }

        guard let textResponse = response as? UNTextInputNotificationResponse,
              !textResponse.userText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return false
        }

        return true
    }

    static func handle(
        response: UNNotificationResponse,
        completion: @escaping () -> Void
    ) {
        guard let textResponse = response as? UNTextInputNotificationResponse,
              let pushData = ChatPushData.from(userInfo: response.notification.request.content.userInfo) else {
            completion()
            return
        }

        let replyText = pushData.truncateReply(textResponse.userText)
        guard !replyText.isEmpty else {
            completion()
            return
        }

        replyQueue.async {
            defer { DispatchQueue.main.async { completion() } }

            guard isOnline() else {
                showReplyFailed()
                return
            }

            let result = ChatReplyApiClient.sendPushReply(data: pushData, content: replyText)
            guard result.success else {
                showReplyFailed()
                return
            }

            if result.unreadBadgeCount >= 0 {
                DispatchQueue.main.async {
                    UIApplication.shared.applicationIconBadgeNumber = max(0, result.unreadBadgeCount)
                }
            }
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
        let queue = DispatchQueue(label: "com.funified.bandeja.chat-reply-reachability")
        monitor.start(queue: queue)
        _ = semaphore.wait(timeout: .now() + 1)
        monitor.cancel()
        return online
    }

    private static func showReplyFailed() {
        DispatchQueue.main.async {
            let content = UNMutableNotificationContent()
            content.title = NSLocalizedString(
                "push_reply_failed",
                tableName: nil,
                bundle: .main,
                value: "Couldn't send your reply",
                comment: "Push inline reply failure"
            )
            content.sound = .default

            let request = UNNotificationRequest(
                identifier: "push-reply-failed-\(UUID().uuidString)",
                content: content,
                trigger: nil
            )
            UNUserNotificationCenter.current().add(request)
        }
    }
}
