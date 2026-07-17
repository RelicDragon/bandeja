import Foundation
import Capacitor
import UserNotifications

@objc(BandejaPushDelegatePlugin)
public class BandejaPushDelegatePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BandejaPushDelegatePlugin"
    public let jsName = "BandejaPushDelegate"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setPushReplyJsReady", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearConversationNotification", returnType: CAPPluginReturnPromise),
    ]

    public override func load() {
        if let bridge {
            BandejaPushNotificationDelegate.shared.attachToBridge(bridge)
        }
    }

    @objc func setPushReplyJsReady(_ call: CAPPluginCall) {
        let ready = call.getBool("ready") ?? false
        BandejaPushNotificationDelegate.shared.setPushReplyJsReady(ready)
        call.resolve()
    }

    @objc func clearConversationNotification(_ call: CAPPluginCall) {
        guard let conversationKey = call.getString("conversationKey")?.trimmingCharacters(in: .whitespacesAndNewlines),
              !conversationKey.isEmpty else {
            call.reject("Missing conversationKey")
            return
        }
        UNUserNotificationCenter.current().getDeliveredNotifications { notifications in
            let ids = notifications.compactMap { notification -> String? in
                let content = notification.request.content
                if content.threadIdentifier == conversationKey {
                    return notification.request.identifier
                }
                let userInfo = content.userInfo
                if let threadId = userInfo["threadId"] as? String, threadId == conversationKey {
                    return notification.request.identifier
                }
                if let conversation = userInfo["conversationKey"] as? String, conversation == conversationKey {
                    return notification.request.identifier
                }
                if let data = userInfo["data"] as? [String: Any] {
                    if let threadId = data["threadId"] as? String, threadId == conversationKey {
                        return notification.request.identifier
                    }
                    if let conversation = data["conversationKey"] as? String, conversation == conversationKey {
                        return notification.request.identifier
                    }
                }
                return nil
            }
            if !ids.isEmpty {
                UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ids)
            }
            call.resolve()
        }
    }
}
