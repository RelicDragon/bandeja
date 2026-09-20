import Foundation
import BandejaNextGames

/// Language code shared between the watch app and its widget extension via the App Group.
/// Returns the profile language's primary subtag unchanged (`en`, `es`, `ru`, `sr`, `cs`, …);
/// copy tables fall back to English on their own, and the same code feeds
/// `Locale(identifier:)` for relative-time formatting on both sides.
enum WatchWidgetLangBridge {
    nonisolated static func normalizedFromStorageOrDevice() -> String {
        let fallback = Locale.current.language.languageCode?.identifier ?? "en"
        let raw = AppGroupStorage.suite?.string(forKey: AppGroupStorage.Keys.uiLanguage)
        let id: String
        if let r = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !r.isEmpty {
            id = r
        } else {
            id = fallback
        }
        return normalizeLanguageIdentifier(id)
    }

    /// `es-ES` → `es`, `zh-Hans` → `zh`; never clamps to a fixed language set.
    nonisolated static func normalizeLanguageIdentifier(_ id: String) -> String {
        let primary = id.split(whereSeparator: { $0 == "-" || $0 == "_" }).first.map(String.init) ?? id
        let lower = primary.lowercased()
        return lower.isEmpty ? "en" : lower
    }
}
