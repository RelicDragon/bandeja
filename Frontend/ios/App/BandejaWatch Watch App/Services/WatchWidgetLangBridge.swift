import Foundation

enum WatchWidgetLangBridge {
    nonisolated static let appGroupSuiteName = "group.com.funified.bandeja"
    nonisolated static let uiLanguageDefaultsKey = "bandeja.widget.uiLanguage.v1"

    nonisolated static func normalizedFromStorageOrDevice() -> String {
        let fallback = Locale.current.language.languageCode?.identifier ?? "en"
        let raw = UserDefaults(suiteName: appGroupSuiteName)?.string(forKey: uiLanguageDefaultsKey)
        let id: String
        if let r = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !r.isEmpty {
            id = r
        } else {
            id = fallback
        }
        return normalizeLanguageIdentifier(id)
    }

    nonisolated static func normalizeLanguageIdentifier(_ id: String) -> String {
        if id.hasPrefix("es") { return "es" }
        if id.hasPrefix("ru") { return "ru" }
        if id.hasPrefix("sr") { return "sr" }
        return "en"
    }
}
