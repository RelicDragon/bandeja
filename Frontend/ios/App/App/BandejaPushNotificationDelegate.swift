import Capacitor
import Foundation
import UserNotifications

final class BandejaPushNotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    static let shared = BandejaPushNotificationDelegate()

    weak var bridge: CAPBridgeProtocol?
    private(set) var pushReplyJsReady = false
    private var previousDelegate: UNUserNotificationCenterDelegate?

    private override init() {
        super.init()
    }

    func installEarly(center: UNUserNotificationCenter = .current()) {
        guard center.delegate !== self else { return }
        previousDelegate = center.delegate
        center.delegate = self
    }

    func attachToBridge(_ bridge: CAPBridgeProtocol, center: UNUserNotificationCenter = .current()) {
        self.bridge = bridge
        if center.delegate !== self {
            previousDelegate = center.delegate
        } else if previousDelegate == nil {
            previousDelegate = bridge.notificationRouter as? UNUserNotificationCenterDelegate
        }
        center.delegate = self
    }

    func setPushReplyJsReady(_ ready: Bool) {
        pushReplyJsReady = ready
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        CommunicationNotificationHelper.donateIfChatPush(userInfo: notification.request.content.userInfo)
        forwardWillPresent(center: center, notification: notification, completionHandler: completionHandler)
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        CommunicationNotificationHelper.donateIfChatPush(userInfo: response.notification.request.content.userInfo)

        if ChatReplyHandler.shouldHandleNatively(response: response, jsReady: pushReplyJsReady) {
            ChatReplyHandler.handle(response: response, completion: completionHandler)
            return
        }

        // PRD 346 — answer the reminder from the shade on a cold start, when no
        // webview exists to take the action. With JS up, the router handles it.
        if AttendanceActionHandler.shouldHandleNatively(response: response, jsReady: pushReplyJsReady) {
            AttendanceActionHandler.handle(response: response, completion: completionHandler)
            return
        }

        // PRD 345 / 357 — the same cold-start path for "I'm in" / "Not this time"
        // and "Keep as planned". The foreground weather actions are deliberately
        // not claimed here: they need a screen, so they fall through to the
        // router below.
        if TokenActionHandler.shouldHandleNatively(response: response, jsReady: pushReplyJsReady) {
            TokenActionHandler.handle(response: response, completion: completionHandler)
            return
        }

        forwardDidReceive(center: center, response: response, completionHandler: completionHandler)
    }

    private func forwardWillPresent(
        center: UNUserNotificationCenter,
        notification: UNNotification,
        completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        if let router = bridge?.notificationRouter as? UNUserNotificationCenterDelegate,
           router.responds(to: #selector(userNotificationCenter(_:willPresent:withCompletionHandler:))) {
            router.userNotificationCenter?(center, willPresent: notification, withCompletionHandler: completionHandler)
            return
        }
        if let previousDelegate,
           previousDelegate.responds(to: #selector(userNotificationCenter(_:willPresent:withCompletionHandler:))) {
            previousDelegate.userNotificationCenter?(center, willPresent: notification, withCompletionHandler: completionHandler)
            return
        }
        completionHandler([.banner, .sound, .badge])
    }

    private func forwardDidReceive(
        center: UNUserNotificationCenter,
        response: UNNotificationResponse,
        completionHandler: @escaping () -> Void
    ) {
        if let router = bridge?.notificationRouter as? UNUserNotificationCenterDelegate,
           router.responds(to: #selector(userNotificationCenter(_:didReceive:withCompletionHandler:))) {
            router.userNotificationCenter?(center, didReceive: response, withCompletionHandler: completionHandler)
            return
        }
        if let previousDelegate,
           previousDelegate.responds(to: #selector(userNotificationCenter(_:didReceive:withCompletionHandler:))) {
            previousDelegate.userNotificationCenter?(center, didReceive: response, withCompletionHandler: completionHandler)
            return
        }
        completionHandler()
    }
}
