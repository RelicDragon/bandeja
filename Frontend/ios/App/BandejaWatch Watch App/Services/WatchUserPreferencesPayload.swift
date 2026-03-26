import Foundation

struct WatchUserPreferencesPayload: Codable, Sendable, Equatable {
    var language: String?
    var weekStart: String?
    var defaultCurrency: String?
    var timeFormat: String?
    var prefsVersion: Double?

    private static let storageKey = "bandeja.watch.userPrefs.v1"

    static func loadFromDefaults() -> WatchUserPreferencesPayload {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let v = try? JSONDecoder().decode(WatchUserPreferencesPayload.self, from: data) else {
            return WatchUserPreferencesPayload()
        }
        return v
    }

    func saveToDefaults() {
        if let data = try? JSONEncoder().encode(self) {
            UserDefaults.standard.set(data, forKey: Self.storageKey)
        }
    }

    static func clearDefaults() {
        UserDefaults.standard.removeObject(forKey: storageKey)
    }

}

struct WatchProfilePreferencesDTO: Sendable {
    let language: String?
    let weekStart: String?
    let defaultCurrency: String?
    let timeFormat: String?
}

extension WatchProfilePreferencesDTO: Decodable {
    nonisolated init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        language = try c.decodeIfPresent(String.self, forKey: .language)
        weekStart = try c.decodeIfPresent(String.self, forKey: .weekStart)
        defaultCurrency = try c.decodeIfPresent(String.self, forKey: .defaultCurrency)
        timeFormat = try c.decodeIfPresent(String.self, forKey: .timeFormat)
    }

    private enum CodingKeys: String, CodingKey {
        case language, weekStart, defaultCurrency, timeFormat
    }
}
