import Foundation
import BandejaNextGames

enum HomeWidgetCopy {
    nonisolated static func widgetLang(_ preferred: String? = nil) -> String {
        let fallback = Locale.current.language.languageCode?.identifier ?? "en"
        let raw = preferred
            ?? AppGroupStorage.suite?.string(forKey: AppGroupStorage.Keys.uiLanguage)
        let id: String
        if let r = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !r.isEmpty {
            id = r
        } else {
            id = fallback
        }
        if id.hasPrefix("es") { return "es" }
        if id.hasPrefix("ru") { return "ru" }
        if id.hasPrefix("sr") { return "sr" }
        if id.hasPrefix("cs") { return "cs" }
        return "en"
    }

    nonisolated static func brand() -> String { "Bandeja" }

    nonisolated static func signIn(_ lang: String) -> String {
        switch lang {
        case "es": return "Inicia sesión para ver tu próximo partido"
        case "ru": return "Войдите, чтобы увидеть следующую игру"
        case "sr": return "Пријавите се да видите следећу игру"
        case "cs": return "Přihlaste se a uvidíte další zápas"
        default: return "Sign in to see your next game"
        }
    }

    nonisolated static func noUpcomingGames(_ lang: String) -> String {
        switch lang {
        case "es": return "No hay partidos próximos"
        case "ru": return "Нет предстоящих игр"
        case "sr": return "Нема предстојећих игара"
        case "cs": return "Žádné nadcházející zápasy"
        default: return "No upcoming games"
        }
    }

    nonisolated static func nextGameWidgetTitle(_ lang: String) -> String {
        switch lang {
        case "es": return "Próximo partido"
        case "ru": return "Следующая игра"
        case "sr": return "Следећа игра"
        case "cs": return "Další zápas"
        default: return "Next Game"
        }
    }

    nonisolated static func nextGameWidgetDescription(_ lang: String) -> String {
        switch lang {
        case "es": return "Muestra tu próximo partido en Bandeja."
        case "ru": return "Показывает вашу следующую игру Bandeja."
        case "sr": return "Приказује вашу следећу Bandeja игру."
        case "cs": return "Zobrazí váš další zápas v Bandeja."
        default: return "Shows your next Bandeja game."
        }
    }

    nonisolated static func now(_ lang: String) -> String {
        switch lang {
        case "es": return "Ahora"
        case "ru": return "Сейчас"
        case "sr": return "Сада"
        case "cs": return "Teď"
        default: return "Now"
        }
    }

    nonisolated static func ended(_ lang: String) -> String {
        switch lang {
        case "es": return "Terminado"
        case "ru": return "Завершено"
        case "sr": return "Завршено"
        case "cs": return "Skončeno"
        default: return "Ended"
        }
    }

    nonisolated static func players(_ count: Int, max: Int?, lang: String) -> String {
        if let max, max > 0 {
            return "\(count)/\(max)"
        }
        return "\(count)"
    }

    nonisolated static func placeholderGameTitle(_ lang: String) -> String {
        switch lang {
        case "es": return "Pádel"
        case "ru": return "Падель"
        case "sr": return "Падел"
        case "cs": return "Padel"
        default: return "Padel"
        }
    }

    nonisolated static func placeholderClub(_ lang: String) -> String {
        switch lang {
        case "es": return "Club"
        case "ru": return "Клуб"
        case "sr": return "Клуб"
        case "cs": return "Klub"
        default: return "Club"
        }
    }
}
