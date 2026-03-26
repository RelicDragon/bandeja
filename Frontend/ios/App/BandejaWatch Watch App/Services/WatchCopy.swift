import Foundation

enum WatchCopy {
    nonisolated static func sectionToday(_ lang: String) -> String {
        switch lang {
        case "es": return "Hoy"
        case "ru": return "Сегодня"
        case "sr": return "Данас"
        default: return "Today"
        }
    }

    nonisolated static func sectionUpcoming(_ lang: String) -> String {
        switch lang {
        case "es": return "Próximos"
        case "ru": return "Предстоящие"
        case "sr": return "Предстојећи"
        default: return "Upcoming"
        }
    }

    nonisolated static func sectionRecent(_ lang: String) -> String {
        switch lang {
        case "es": return "Recientes"
        case "ru": return "Недавние"
        case "sr": return "Недавни"
        default: return "Recent"
        }
    }

    nonisolated static func navTitle(_ lang: String) -> String {
        "Bandeja"
    }

    nonisolated static func loadingGames(_ lang: String) -> String {
        switch lang {
        case "es": return "Cargando partidos…"
        case "ru": return "Загрузка игр…"
        case "sr": return "Учитавање игара…"
        default: return "Loading games…"
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

    nonisolated static func retry(_ lang: String) -> String {
        switch lang {
        case "es": return "Reintentar"
        case "ru": return "Повторить"
        case "sr": return "Покушај поново"
        default: return "Retry"
        }
    }

    nonisolated static func signInRequired(_ lang: String) -> String {
        switch lang {
        case "es": return "Inicia sesión"
        case "ru": return "Вход"
        case "sr": return "Пријава"
        default: return "Sign In Required"
        }
    }

    nonisolated static func openOnIPhone(_ lang: String) -> String {
        switch lang {
        case "es": return "Abre Bandeja en el iPhone para iniciar sesión."
        case "ru": return "Откройте Bandeja на iPhone для входа."
        case "sr": return "Отворите Bandeja на iPhone-у за пријаву."
        default: return "Open Bandeja on your iPhone to sign in."
        }
    }

    nonisolated static func loadingEllipsis(_ lang: String) -> String {
        switch lang {
        case "es": return "Cargando…"
        case "ru": return "Загрузка…"
        case "sr": return "Учитавање…"
        default: return "Loading…"
        }
    }

    nonisolated static func gameTitle(_ lang: String) -> String {
        switch lang {
        case "es": return "Partido"
        case "ru": return "Игра"
        case "sr": return "Игра"
        default: return "Game"
        }
    }

    nonisolated static func players(_ lang: String) -> String {
        switch lang {
        case "es": return "Jugadores"
        case "ru": return "Игроки"
        case "sr": return "Играчи"
        default: return "Players"
        }
    }

    nonisolated static func soon(_ lang: String) -> String {
        switch lang {
        case "es": return "Pronto"
        case "ru": return "Скоро"
        case "sr": return "Ускоро"
        default: return "Soon"
        }
    }

    nonisolated static func startGame(_ lang: String) -> String {
        switch lang {
        case "es": return "Empezar partido"
        case "ru": return "Начать игру"
        case "sr": return "Започни игру"
        default: return "Start Game"
        }
    }

    nonisolated static func enterResults(_ lang: String) -> String {
        switch lang {
        case "es": return "Introducir resultados"
        case "ru": return "Ввести результаты"
        case "sr": return "Унеси резултате"
        default: return "Enter Results"
        }
    }

    nonisolated static func continueScoring(_ lang: String) -> String {
        switch lang {
        case "es": return "Continuar marcador"
        case "ru": return "Продолжить счёт"
        case "sr": return "Настави бодовање"
        default: return "Continue Scoring"
        }
    }

    nonisolated static func resultsFinal(_ lang: String) -> String {
        switch lang {
        case "es": return "Resultados finales"
        case "ru": return "Итоговый результат"
        case "sr": return "Коначан резултат"
        default: return "Results Final"
        }
    }

    nonisolated static func statusAnnounced(_ lang: String) -> String {
        switch lang {
        case "es": return "Anunciado"
        case "ru": return "Анонсирован"
        case "sr": return "Најављено"
        default: return "Announced"
        }
    }

    nonisolated static func statusInProgress(_ lang: String) -> String {
        switch lang {
        case "es": return "En curso"
        case "ru": return "Идёт"
        case "sr": return "У току"
        default: return "In Progress"
        }
    }

    nonisolated static func statusScoring(_ lang: String) -> String {
        switch lang {
        case "es": return "Marcador"
        case "ru": return "Счёт"
        case "sr": return "Бодовање"
        default: return "Scoring"
        }
    }

    nonisolated static func statusFinished(_ lang: String) -> String {
        switch lang {
        case "es": return "Finalizado"
        case "ru": return "Завершено"
        case "sr": return "Завршено"
        default: return "Finished"
        }
    }

    nonisolated static func statusArchived(_ lang: String) -> String {
        switch lang {
        case "es": return "Archivado"
        case "ru": return "В архиве"
        case "sr": return "Архивирано"
        default: return "Archived"
        }
    }

    nonisolated static func errorSignInOnIPhone(_ lang: String) -> String {
        switch lang {
        case "es": return "Inicia sesión en el iPhone."
        case "ru": return "Войдите на iPhone."
        case "sr": return "Пријавите се на iPhone-у."
        default: return "Please sign in on your iPhone."
        }
    }

    nonisolated static func errorServer(_ lang: String, code: Int) -> String {
        switch lang {
        case "es": return "Error del servidor (\(code))."
        case "ru": return "Ошибка сервера (\(code))."
        case "sr": return "Грешка сервера (\(code))."
        default: return "Server error (\(code))."
        }
    }

    nonisolated static func errorNotSignedIn(_ lang: String) -> String {
        switch lang {
        case "es": return "Sin sesión. Abre Bandeja en el iPhone."
        case "ru": return "Не выполнен вход. Откройте Bandeja на iPhone."
        case "sr": return "Нисте пријављени. Отворите Bandeja на iPhone-у."
        default: return "Not signed in. Open Bandeja on your iPhone."
        }
    }

    nonisolated static func errorUnexpectedResponse(_ lang: String) -> String {
        switch lang {
        case "es": return "Respuesta inesperada del servidor."
        case "ru": return "Неожиданный ответ сервера."
        case "sr": return "Неочекиван одговор сервера."
        default: return "Unexpected server response."
        }
    }
}
