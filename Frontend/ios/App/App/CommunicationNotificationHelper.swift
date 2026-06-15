import Foundation
import UserNotifications

enum CommunicationNotificationHelper {
    static func donateIfChatPush(userInfo: [AnyHashable: Any]) {
        guard ChatCommunicationIntentBuilder.shouldDecorate(userInfo: userInfo),
              let intent = ChatCommunicationIntentBuilder.makeIntent(userInfo: userInfo, messageBody: nil) else {
            return
        }
        ChatCommunicationIntentBuilder.donateIncomingInteraction(intent)
    }
}
