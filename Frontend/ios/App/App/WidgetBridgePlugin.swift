import Foundation
import Capacitor
import BandejaWatchShared
import WidgetKit

@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "syncNextGames", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearNextGames", returnType: CAPPluginReturnPromise),
    ]

    private static let isoLock = NSLock()
    private static let isoWithFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let isoPlain: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            if let date = Self.parseISO8601(raw) {
                return date
            }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid ISO8601 date: \(raw)"
            )
        }
        return decoder
    }()

    @objc func syncNextGames(_ call: CAPPluginCall) {
        guard let envelope = decodeEnvelope(from: call) else {
            call.reject("Invalid next-games envelope")
            return
        }
        guard NextGamesEnvelopeStore.write(envelope) else {
            call.reject("App Group storage unavailable")
            return
        }
        Self.reloadHomeWidgets()
        call.resolve()
    }

    @objc func clearNextGames(_ call: CAPPluginCall) {
        guard NextGamesEnvelopeStore.clear() else {
            call.reject("App Group storage unavailable")
            return
        }
        Self.reloadHomeWidgets()
        call.resolve()
    }

    private static func reloadHomeWidgets() {
        DispatchQueue.main.async {
            WidgetCenter.shared.reloadTimelines(ofKind: HomeWidgetKinds.nextGame)
        }
    }

    private func decodeEnvelope(from call: CAPPluginCall) -> NextGamesEnvelope? {
        let sanitized = Self.sanitizeJSONValue(call.options)
        guard JSONSerialization.isValidJSONObject(sanitized),
              let data = try? JSONSerialization.data(withJSONObject: sanitized),
              let payload = try? Self.decoder.decode(WidgetNextGamesPayload.self, from: data)
        else {
            return nil
        }
        return payload.toEnvelope()
    }

    /// Capacitor passes JS numbers as NSNumber/Double; normalize whole numbers to Int for Codable.
    private static func sanitizeJSONValue(_ value: Any) -> Any {
        if value is NSNull {
            return NSNull()
        }
        if let number = value as? NSNumber {
            if CFGetTypeID(number) == CFBooleanGetTypeID() {
                return number.boolValue
            }
            let doubleValue = number.doubleValue
            if doubleValue.rounded() == doubleValue,
               doubleValue >= Double(Int.min),
               doubleValue <= Double(Int.max) {
                return Int(doubleValue)
            }
            return doubleValue
        }
        if let array = value as? [Any] {
            return array.map { sanitizeJSONValue($0) }
        }
        if let dictionary = value as? [String: Any] {
            return dictionary.mapValues { sanitizeJSONValue($0) }
        }
        if let dictionary = value as? NSDictionary {
            var result: [String: Any] = [:]
            dictionary.forEach { key, nested in
                guard let stringKey = key as? String else { return }
                result[stringKey] = sanitizeJSONValue(nested)
            }
            return result
        }
        return value
    }

    private static func parseISO8601(_ string: String) -> Date? {
        isoLock.lock()
        defer { isoLock.unlock() }
        if let date = isoWithFractionalSeconds.date(from: string) { return date }
        return isoPlain.date(from: string)
    }
}

private struct WidgetNextGamesPayload: Decodable {
    let isAuthenticated: Bool
    let language: String
    let games: [WidgetCachedNextGamePayload]

    func toEnvelope() -> NextGamesEnvelope {
        NextGamesEnvelope(
            isAuthenticated: isAuthenticated,
            language: language,
            games: games.map { $0.toCachedNextGame() }
        )
    }
}

private struct WidgetCachedNextGamePayload: Decodable {
    let id: String
    let title: String
    let clubName: String?
    let startTime: Date
    let status: String
    let resultsStatus: String
    let gameType: String
    let participantCount: Int
    let maxParticipants: Int?
    let sport: String?
    let playersPerMatch: Int?

    func toCachedNextGame() -> CachedNextGame {
        CachedNextGame(
            id: id,
            title: title,
            clubName: clubName,
            startTime: startTime,
            status: status,
            resultsStatus: resultsStatus,
            gameType: gameType,
            participantCount: participantCount,
            maxParticipants: maxParticipants,
            sport: sport,
            playersPerMatch: playersPerMatch
        )
    }
}
