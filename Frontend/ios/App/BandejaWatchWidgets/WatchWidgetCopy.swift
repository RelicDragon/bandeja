import Foundation

enum WatchWidgetCopy {
    private static let appGroupSuite = "group.com.funified.bandeja"
    private static let uiLanguageKey = "bandeja.widget.uiLanguage.v1"

    nonisolated static func widgetLang() -> String {
        let fallback = Locale.current.language.languageCode?.identifier ?? "en"
        let raw = UserDefaults(suiteName: appGroupSuite)?.string(forKey: uiLanguageKey)
        let id: String
        if let r = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !r.isEmpty {
            id = r
        } else {
            id = fallback
        }
        if id.hasPrefix("es") { return "es" }
        if id.hasPrefix("ru") { return "ru" }
        if id.hasPrefix("sr") { return "sr" }
        return "en"
    }

    nonisolated static func brand() -> String { "Bandeja" }

    nonisolated static func signInOnIPhone(_ lang: String) -> String {
        switch lang {
        case "es": return "Abre Bandeja en el iPhone para iniciar sesión."
        case "ru": return "Откройте Bandeja на iPhone для входа."
        case "sr": return "Отворите Bandeja на iPhone-у за пријаву."
        default: return "Open Bandeja on your iPhone to sign in."
        }
    }

    nonisolated static func noUpcomingGames(_ lang: String) -> String {
        switch lang {
        case "es": return "No hay partidos próximos"
        case "ru": return "Нет предстоящих игр"
        case "sr": return "Нема предстојећих игара"
        default: return "No upcoming games"
        }
    }

    nonisolated static func nextGameWidgetTitle(_ lang: String) -> String {
        switch lang {
        case "es": return "Próximo partido"
        case "ru": return "Следующая игра"
        case "sr": return "Следећа игра"
        default: return "Next Game"
        }
    }

    nonisolated static func nextGameWidgetDescription(_ lang: String) -> String {
        switch lang {
        case "es": return "Muestra tu próximo partido de pádel en Bandeja."
        case "ru": return "Показывает вашу следующую игру Bandeja."
        case "sr": return "Приказује вашу следећу Bandeja игру."
        default: return "Shows your next Bandeja padel game."
        }
    }

    nonisolated static func now(_ lang: String) -> String {
        switch lang {
        case "es": return "Ahora"
        case "ru": return "Сейчас"
        case "sr": return "Сада"
        default: return "Now"
        }
    }

    nonisolated static func ended(_ lang: String) -> String {
        switch lang {
        case "es": return "Terminado"
        case "ru": return "Завершено"
        case "sr": return "Завршено"
        default: return "Ended"
        }
    }

    nonisolated static func placeholderGameTitle(_ lang: String) -> String {
        switch lang {
        case "es": return "Pádel"
        case "ru": return "Падель"
        case "sr": return "Падел"
        default: return "Padel"
        }
    }

    nonisolated static func placeholderClub(_ lang: String) -> String {
        switch lang {
        case "es": return "Club"
        case "ru": return "Клуб"
        case "sr": return "Клуб"
        default: return "Club"
        }
    }

}
