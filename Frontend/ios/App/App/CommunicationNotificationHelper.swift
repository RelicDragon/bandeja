import Foundation
import Intents
import UserNotifications

enum CommunicationNotificationHelper {
    private static let chatTypes: Set<String> = [
        "USER_CHAT",
        "GAME_CHAT",
        "GROUP_CHAT",
        "BUG_CHAT",
    ]

    static func donateIfChatPush(userInfo: [AnyHashable: Any]) {
        guard let type = stringValue(userInfo["type"]), chatTypes.contains(type) else {
            return
        }

        let data = nestedData(from: userInfo)
        if stringValue(data["sourceType"]) != nil && stringValue(data["sourceId"]) != nil {
            return
        }
        guard stringValue(data["messageId"]) != nil,
              stringValue(data["chatContextType"]) != nil,
              stringValue(data["contextId"]) != nil else {
            return
        }
        let senderName = stringValue(data["senderName"]) ?? stringValue(userInfo["title"]) ?? "Message"
        let senderId = stringValue(data["userId"]) ?? senderName
        let messageBody = stringValue(data["body"]) ?? stringValue(userInfo["body"]) ?? ""
        let conversationId = conversationKey(from: data, type: type)

        var senderImage: INImage? = nil
        if let avatarUrl = stringValue(data["senderAvatarUrl"]), let url = URL(string: avatarUrl) {
            senderImage = INImage(url: url)
        }

        let sender = INPerson(
            personHandle: INPersonHandle(value: senderId, type: .unknown),
            nameComponents: nil,
            displayName: senderName,
            image: senderImage,
            contactIdentifier: nil,
            customIdentifier: senderId
        )

        let intent = INSendMessageIntent(
            recipients: nil,
            outgoingMessageType: .outgoingMessageText,
            content: messageBody,
            speakableGroupName: nil,
            conversationIdentifier: conversationId,
            serviceName: nil,
            sender: sender,
            attachments: nil
        )

        let interaction = INInteraction(intent: intent, response: nil)
        interaction.direction = .incoming
        interaction.donate { error in
            if let error = error {
                NSLog("[push-reply] communication intent donate failed: %@", error.localizedDescription)
            }
        }
    }

    private static func nestedData(from userInfo: [AnyHashable: Any]) -> [String: Any] {
        if let payload = userInfo["data"] as? [String: Any] {
            return payload
        }
        var flat: [String: Any] = [:]
        for (key, value) in userInfo {
            if let k = key as? String {
                flat[k] = value
            }
        }
        return flat
    }

    private static func stringValue(_ value: Any?) -> String? {
        guard let value = value else { return nil }
        let text = String(describing: value).trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? nil : text
    }

    private static func conversationKey(from data: [String: Any], type: String) -> String {
        if let contextId = stringValue(data["contextId"]), let chatContextType = stringValue(data["chatContextType"]) {
            if chatContextType == "GAME", let chatType = stringValue(data["chatType"]) {
                return "game-chat:\(contextId):\(chatType)"
            }
            return "\(chatContextType.lowercased()):\(contextId)"
        }
        if type == "USER_CHAT", let userChatId = stringValue(data["userChatId"]) {
            return "user-chat:\(userChatId)"
        }
        if type == "GAME_CHAT", let gameId = stringValue(data["gameId"]) {
            return "game-chat:\(gameId):\(stringValue(data["chatType"]) ?? "PUBLIC")"
        }
        if type == "GROUP_CHAT", let groupChannelId = stringValue(data["groupChannelId"]) {
            return "group:\(groupChannelId)"
        }
        if type == "BUG_CHAT", let bugId = stringValue(data["bugId"]) {
            return "bug:\(bugId)"
        }
        return type
    }
}
