import Foundation

enum NativeApiConfig {
    private static let defaultsKey = "bandeja_native_api_base_url"
    private static let defaultApiBaseUrl = "https://bandeja.me/api"

    static func setApiBaseUrl(_ apiBaseUrl: String) {
        let trimmed = apiBaseUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let normalized = trimmed.replacingOccurrences(
            of: "/+$",
            with: "",
            options: .regularExpression
        )
        UserDefaults.standard.set(normalized, forKey: defaultsKey)
    }

    static func getApiBaseUrl() -> String {
        if let stored = UserDefaults.standard.string(forKey: defaultsKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !stored.isEmpty {
            return stored
        }
        return defaultApiBaseUrl
    }
}
