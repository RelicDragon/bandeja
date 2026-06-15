import Foundation
import Intents

enum ChatCommunicationIntentBuilder {
    private static let chatTypes: Set<String> = [
        "USER_CHAT",
        "GAME_CHAT",
        "GROUP_CHAT",
        "BUG_CHAT",
    ]

    static func shouldDecorate(userInfo: [AnyHashable: Any]) -> Bool {
        guard let type = stringValue(userInfo["type"]), chatTypes.contains(type) else {
            return false
        }

        let data = nestedData(from: userInfo)
        if stringValue(data["sourceType"]) != nil && stringValue(data["sourceId"]) != nil {
            return false
        }

        return stringValue(data["messageId"]) != nil
            && stringValue(data["chatContextType"]) != nil
            && stringValue(data["contextId"]) != nil
    }

    static func resolveSenderAvatarUrl(from userInfo: [AnyHashable: Any]) -> URL? {
        let data = nestedData(from: userInfo)
        guard let avatarUrl = stringValue(data["senderAvatarUrl"]) else {
            return nil
        }
        return URL(string: avatarUrl)
    }

    static func makeIntent(
        userInfo: [AnyHashable: Any],
        messageBody: String?,
        senderImage: INImage? = nil
    ) -> INSendMessageIntent? {
        guard let type = stringValue(userInfo["type"]), chatTypes.contains(type) else {
            return nil
        }

        let data = nestedData(from: userInfo)
        if stringValue(data["sourceType"]) != nil && stringValue(data["sourceId"]) != nil {
            return nil
        }
        guard stringValue(data["messageId"]) != nil,
              stringValue(data["chatContextType"]) != nil,
              stringValue(data["contextId"]) != nil else {
            return nil
        }

        let senderName = stringValue(data["senderName"]) ?? stringValue(userInfo["title"]) ?? "Message"
        let senderId = stringValue(data["userId"]) ?? senderName
        let body = stringValue(data["body"])
            ?? messageBody
            ?? stringValue(userInfo["body"])
            ?? ""
        let conversationId = conversationKey(from: data, type: type)

        let resolvedSenderImage: INImage?
        if let senderImage {
            resolvedSenderImage = senderImage
        } else if let avatarUrl = resolveSenderAvatarUrl(from: userInfo) {
            resolvedSenderImage = INImage(url: avatarUrl)
        } else {
            resolvedSenderImage = nil
        }

        let sender = INPerson(
            personHandle: INPersonHandle(value: senderId, type: .unknown),
            nameComponents: nil,
            displayName: senderName,
            image: resolvedSenderImage,
            contactIdentifier: nil,
            customIdentifier: senderId
        )

        return INSendMessageIntent(
            recipients: nil,
            outgoingMessageType: .outgoingMessageText,
            content: body,
            speakableGroupName: nil,
            conversationIdentifier: conversationId,
            serviceName: nil,
            sender: sender,
            attachments: nil
        )
    }

    static func donateIncomingInteraction(_ intent: INSendMessageIntent) {
        let interaction = INInteraction(intent: intent, response: nil)
        interaction.direction = .incoming
        interaction.donate { error in
            if let error = error {
                NSLog("[push-reply] communication intent donate failed: %@", error.localizedDescription)
            }
        }
    }

    static func nestedData(from userInfo: [AnyHashable: Any]) -> [String: Any] {
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

    static func stringValue(_ value: Any?) -> String? {
        guard let value = value else { return nil }
        let text = String(describing: value).trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? nil : text
    }

    static func conversationKey(from data: [String: Any], type: String) -> String {
        if let contextId = stringValue(data["contextId"]), let chatContextType = stringValue(data["chatContextType"]) {
            if chatContextType == "GAME", let chatType = stringValue(data["chatType"]) {
                return "game-chat:\(contextId):\(chatType)"
            }
            if chatContextType == "USER" {
                return "user-chat:\(contextId)"
            }
            if chatContextType == "GROUP" {
                return "group:\(contextId)"
            }
            if chatContextType == "BUG" {
                return "bug:\(contextId)"
            }
            return "\(chatContextType.lowercased()):\(contextId)"
        }
        if let conversationKey = stringValue(data["conversationKey"]) {
            return conversationKey
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
