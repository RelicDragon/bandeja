import Foundation

/// PRD 345 / 357 — a push whose shade button carries a signed action token.
///
/// Generic on purpose. The attendance pair (PRD 346) predates this and keeps its
/// own type; everything added after it is described by one table below, so a
/// third family costs a case rather than a file.
///
/// Only **token** buttons appear here. The foreground ones ("Move indoor",
/// "View forecast") open the app and are routed by the web layer from the deep
/// link the payload carries, so the native side must not intercept them.
struct TokenActionPushData {
    /// One signed shade answer.
    struct Answer {
        let actionIdentifier: String
        let tokenKey: String
        let ackKey: String
    }

    static let seriesCategoryId = "GAME_SERIES_NEXT_PROMPT"
    static let weatherOrganizerCategoryId = "GAME_WEATHER_ALERT_ORGANIZER"
    static let weatherCategoryId = "GAME_WEATHER_ALERT"

    /// Every token answer this handler knows, keyed by the push `type`.
    private static let answers: [String: [Answer]] = [
        seriesCategoryId: [
            Answer(actionIdentifier: "accept", tokenKey: "acceptActionToken", ackKey: "seriesAcceptAck"),
            Answer(actionIdentifier: "decline", tokenKey: "declineActionToken", ackKey: "seriesDeclineAck")
        ],
        weatherCategoryId: [
            Answer(actionIdentifier: "keep", tokenKey: "weatherKeepActionToken", ackKey: "weatherKeptAck")
        ]
    ]

    let type: String
    let gameId: String
    let actionToken: String
    let acknowledgement: String?

    static func from(
        userInfo: [AnyHashable: Any],
        actionIdentifier: String
    ) -> TokenActionPushData? {
        guard let type = stringValue(userInfo["type"]),
              let candidates = answers[type],
              let answer = candidates.first(where: { $0.actionIdentifier == actionIdentifier })
        else {
            return nil
        }

        let data = nestedData(from: userInfo)
        guard let gameId = stringValue(data["gameId"]),
              let token = stringValue(data[answer.tokenKey]) else {
            return nil
        }

        return TokenActionPushData(
            type: type,
            gameId: gameId,
            actionToken: token,
            acknowledgement: stringValue(data[answer.ackKey])
        )
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
