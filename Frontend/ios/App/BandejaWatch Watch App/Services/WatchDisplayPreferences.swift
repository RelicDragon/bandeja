import Foundation

enum WatchDisplayPreferences {

    nonisolated static func resolvedLocale(language: String?, deviceLocale: Locale = .current) -> Locale {
        if let language, !language.isEmpty, language != "auto" {
            return Locale(identifier: language)
        }
        return deviceLocale
    }

    nonisolated static func calendar(weekStart: String?, resolvedLocale: Locale) -> Calendar {
        let sundayFirstLocaleIds: Set<String> = ["en-US", "en-CA", "en-PH", "en-AU"]
        var cal = Calendar(identifier: .gregorian)
        cal.locale = resolvedLocale

        let firstWeekday: Int
        switch weekStart {
        case "sunday":
            firstWeekday = 1
        case "monday":
            firstWeekday = 2
        case "auto", nil:
            let id = resolvedLocale.identifier.replacingOccurrences(of: "_", with: "-")
            firstWeekday = sundayFirstLocaleIds.contains(id) ? 1 : 2
        default:
            let id = resolvedLocale.identifier.replacingOccurrences(of: "_", with: "-")
            firstWeekday = sundayFirstLocaleIds.contains(id) ? 1 : 2
        }
        cal.firstWeekday = firstWeekday
        return cal
    }

    nonisolated static func resolvedCurrencyCode(defaultCurrency: String?, deviceLocale: Locale = .current) -> String {
        if let c = defaultCurrency?.trimmingCharacters(in: .whitespacesAndNewlines),
           c != "auto",
           c.count == 3,
           c.uppercased() == c {
            return c
        }
        if let cur = deviceLocale.currency?.identifier, cur.count == 3 {
            return cur
        }
        return "EUR"
    }

    nonisolated static func uiLanguageCode(language: String?, deviceLocale: Locale = .current) -> String {
        let loc = resolvedLocale(language: language, deviceLocale: deviceLocale)
        return loc.language.languageCode?.identifier ?? "en"
    }
}
