import Foundation

/// PRD 346 — the reminder that carries the two attendance shade actions.
///
/// Confirmation is a courtesy signal: an answer posts a state and nothing else.
/// Neither action can join, leave or reorder anybody.
struct AttendancePushData {
    static let categoryId = "GAME_REMINDER"
    static let confirmActionId = "confirm"
    static let unsureActionId = "unsure"

    enum Answer {
        case confirmed
        case unsure

        init?(actionIdentifier: String) {
            switch actionIdentifier {
            case AttendancePushData.confirmActionId: self = .confirmed
            case AttendancePushData.unsureActionId: self = .unsure
            default: return nil
            }
        }
    }

    let gameId: String
    let confirmActionToken: String
    let unsureActionToken: String
    let confirmedAck: String?
    let unsureAck: String?

    static func from(userInfo: [AnyHashable: Any]) -> AttendancePushData? {
        guard stringValue(userInfo["type"]) == categoryId else { return nil }

        let data = nestedData(from: userInfo)
        guard let gameId = stringValue(data["gameId"]),
              let confirmToken = stringValue(data["attendanceActionToken"]),
              let unsureToken = stringValue(data["attendanceUnsureActionToken"]) else {
            return nil
        }

        return AttendancePushData(
            gameId: gameId,
            confirmActionToken: confirmToken,
            unsureActionToken: unsureToken,
            confirmedAck: stringValue(data["attendanceConfirmedAck"]),
            unsureAck: stringValue(data["attendanceUnsureAck"])
        )
    }

    func actionToken(for answer: Answer) -> String {
        switch answer {
        case .confirmed: return confirmActionToken
        case .unsure: return unsureActionToken
        }
    }

    /// The backend localizes both acknowledgements per recipient, because the
    /// shade handler answers without a webview to translate in.
    func acknowledgement(for answer: Answer) -> String? {
        switch answer {
        case .confirmed: return confirmedAck
        case .unsure: return unsureAck
        }
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
