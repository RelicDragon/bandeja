import Foundation
import Capacitor

@objc(ChatIntentBridgePlugin)
public class ChatIntentBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ChatIntentBridgePlugin"
    public let jsName = "ChatIntentBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "donateMessageIntent", returnType: CAPPluginReturnPromise),
    ]

    @objc func donateMessageIntent(_ call: CAPPluginCall) {
        guard let direction = call.getString("direction"),
              let conversationIdentifier = call.getString("conversationIdentifier"),
              let senderId = call.getString("senderId"),
              let senderName = call.getString("senderName") else {
            call.reject("Missing required donation parameters")
            return
        }

        let body = call.getString("body") ?? ""
        let senderAvatarUrl = call.getString("senderAvatarUrl")
        let intent = ChatCommunicationIntentBuilder.makeIntentFromDonationParams(
            conversationIdentifier: conversationIdentifier,
            messageBody: body,
            senderId: senderId,
            senderName: senderName,
            senderAvatarUrl: senderAvatarUrl
        )

        switch direction {
        case "outgoing":
            ChatCommunicationIntentBuilder.donateOutgoingInteraction(intent)
        case "incoming":
            ChatCommunicationIntentBuilder.donateIncomingInteraction(intent)
        default:
            call.reject("Invalid direction")
            return
        }

        call.resolve()
    }
}
