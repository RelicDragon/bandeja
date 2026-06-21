import Foundation

struct ChatPushData {
    static let maxReplyLength = 4096
    static let replyActionId = "reply"
    static let replyCategoryId = "CHAT_REPLY"

    private static let replyableTypes: Set<String> = [
        "USER_CHAT",
        "GAME_CHAT",
        "GROUP_CHAT",
        "BUG_CHAT",
    ]

    let type: String
    let chatContextType: String
    let contextId: String
    let messageId: String
    let chatType: String?
    let replyToken: String?

    static func from(userInfo: [AnyHashable: Any]) -> ChatPushData? {
        guard let type = stringValue(userInfo["type"]), replyableTypes.contains(type) else {
            return nil
        }

        let data = nestedData(from: userInfo)
        if stringValue(data["sourceType"]) != nil, stringValue(data["sourceId"]) != nil {
            return nil
        }

        guard let chatContextType = stringValue(data["chatContextType"]),
              let contextId = stringValue(data["contextId"]),
              let messageId = stringValue(data["messageId"]) else {
            return nil
        }

        return ChatPushData(
            type: type,
            chatContextType: chatContextType,
            contextId: contextId,
            messageId: messageId,
            chatType: stringValue(data["chatType"]),
            replyToken: stringValue(data["replyToken"])
        )
    }

    func truncateReply(_ text: String) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count > Self.maxReplyLength else { return trimmed }
        return String(trimmed.prefix(Self.maxReplyLength))
    }

    private static func nestedData(from userInfo: [AnyHashable: Any]) -> [String: Any] {
        if let payload = userInfo["data"] as? [String: Any] {
            return payload
        }
        var flat: [String: Any] = [:]
        for (key, value) in userInfo {
            if let key = key as? String {
                flat[key] = value
            }
        }
        return flat
    }

    private static func stringValue(_ value: Any?) -> String? {
        guard let value else { return nil }
        let text = String(describing: value).trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? nil : text
    }
}
