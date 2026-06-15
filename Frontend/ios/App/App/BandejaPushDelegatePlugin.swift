import Foundation
import Capacitor
import UserNotifications

@objc(BandejaPushDelegatePlugin)
public class BandejaPushDelegatePlugin: CAPPlugin, CAPBridgedPlugin, UNUserNotificationCenterDelegate {
    public let identifier = "BandejaPushDelegatePlugin"
    public let jsName = "BandejaPushDelegate"
    public let pluginMethods: [CAPPluginMethod] = []

    private var previousDelegate: UNUserNotificationCenterDelegate?

    public override func load() {
        let center = UNUserNotificationCenter.current()
        previousDelegate = center.delegate
        center.delegate = self
    }

    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        CommunicationNotificationHelper.donateIfChatPush(userInfo: notification.request.content.userInfo)
        if let previousDelegate = previousDelegate,
           previousDelegate.responds(to: #selector(userNotificationCenter(_:willPresent:withCompletionHandler:))) {
            previousDelegate.userNotificationCenter?(center, willPresent: notification, withCompletionHandler: completionHandler)
            return
        }
        completionHandler([.banner, .sound, .badge])
    }

    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        CommunicationNotificationHelper.donateIfChatPush(userInfo: response.notification.request.content.userInfo)
        if let previousDelegate = previousDelegate,
           previousDelegate.responds(to: #selector(userNotificationCenter(_:didReceive:withCompletionHandler:))) {
            previousDelegate.userNotificationCenter?(center, didReceive: response, withCompletionHandler: completionHandler)
            return
        }
        completionHandler()
    }
}
