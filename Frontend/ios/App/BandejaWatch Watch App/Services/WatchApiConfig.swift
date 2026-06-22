import Foundation

enum WatchApiConfig {
    nonisolated private static let appGroupSuiteName = "group.com.funified.bandeja"
    nonisolated private static let defaultsKey = "bandeja_native_api_base_url"
    nonisolated static let defaultApiBaseUrl = "https://bandeja.me/api"

    nonisolated static func apiBaseUrlString() -> String {
        if let stored = UserDefaults(suiteName: appGroupSuiteName)?.string(forKey: defaultsKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !stored.isEmpty {
            return stored
        }
        return defaultApiBaseUrl
    }

    nonisolated static func apiBaseURL() -> URL {
        URL(string: apiBaseUrlString()) ?? URL(string: defaultApiBaseUrl)!
    }

    nonisolated static func mediaOrigin() -> String {
        var s = apiBaseUrlString()
        if s.hasSuffix("/api/") {
            s.removeLast(5)
        } else if s.hasSuffix("/api") {
            s.removeLast(4)
        }
        return s.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }
}
