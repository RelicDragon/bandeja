import Foundation

enum NativeApiConfig {
    static let appGroupSuiteName = "group.com.funified.bandeja"
    static let defaultsKey = "bandeja_native_api_base_url"
    private static let defaultApiBaseUrl = "https://bandeja.me/api"

    static func setApiBaseUrl(_ apiBaseUrl: String) {
        guard let normalized = normalizeApiBaseUrl(apiBaseUrl) else { return }
        UserDefaults.standard.set(normalized, forKey: defaultsKey)
        UserDefaults(suiteName: appGroupSuiteName)?.set(normalized, forKey: defaultsKey)
    }

    static func getApiBaseUrl() -> String {
        storedApiBaseUrl(from: UserDefaults.standard) ?? defaultApiBaseUrl
    }

    static func normalizeApiBaseUrl(_ apiBaseUrl: String) -> String? {
        let trimmed = apiBaseUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return trimmed.replacingOccurrences(
            of: "/+$",
            with: "",
            options: .regularExpression
        )
    }

    static func storedApiBaseUrl(from defaults: UserDefaults?) -> String? {
        guard let stored = defaults?.string(forKey: defaultsKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !stored.isEmpty else {
            return nil
        }
        return stored
    }
}
