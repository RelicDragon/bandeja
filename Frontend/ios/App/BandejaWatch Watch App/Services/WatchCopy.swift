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

    nonisolated static func matches(_ lang: String) -> String {
        switch lang {
        case "es": return "Partidos"
        case "ru": return "Матчи"
        case "sr": return "Мечеви"
        default: return "Matches"
        }
    }

    nonisolated static func scoresPreview(_ lang: String) -> String {
        switch lang {
        case "es": return "Marcador"
        case "ru": return "Счёт"
        case "sr": return "Резултат"
        default: return "Scores"
        }
    }

    nonisolated static func roundMatch(_ lang: String, round: Int, match: Int) -> String {
        switch lang {
        case "ru": return "Р\(round) · М\(match)"
        case "sr": return "Р\(round) · М\(match)"
        default: return "R\(round) · M\(match)"
        }
    }

    nonisolated static func waitingForRound(_ lang: String) -> String {
        switch lang {
        case "es": return "Esperando a que empiece la ronda…"
        case "ru": return "Ожидание начала раунда…"
        case "sr": return "Чека се почетак рунде…"
        default: return "Waiting for round start..."
        }
    }

    nonisolated static func finalizeResults(_ lang: String) -> String {
        switch lang {
        case "es": return "Finalizar resultados"
        case "ru": return "Завершить результаты"
        case "sr": return "Заврши резултате"
        default: return "Finalize Results"
        }
    }

    nonisolated static func outcomes(_ lang: String) -> String {
        switch lang {
        case "es": return "Resultados"
        case "ru": return "Итоги"
        case "sr": return "Исходи"
        default: return "Outcomes"
        }
    }

    nonisolated static func match(_ lang: String) -> String {
        switch lang {
        case "es": return "Partido"
        case "ru": return "Матч"
        case "sr": return "Меч"
        default: return "Match"
        }
    }

    nonisolated static func review(_ lang: String) -> String {
        switch lang {
        case "es": return "Revisar"
        case "ru": return "Проверка"
        case "sr": return "Провера"
        default: return "Review"
        }
    }

    nonisolated static func finishMatch(_ lang: String) -> String {
        switch lang {
        case "es": return "Terminar partido"
        case "ru": return "Завершить матч"
        case "sr": return "Заврши меч"
        default: return "Finish Match"
        }
    }

    nonisolated static func backToScoring(_ lang: String) -> String {
        switch lang {
        case "es": return "Volver al marcador"
        case "ru": return "Назад к счёту"
        case "sr": return "Назад на бодовање"
        default: return "Back to Scoring"
        }
    }

    nonisolated static func close(_ lang: String) -> String {
        switch lang {
        case "es": return "Cerrar"
        case "ru": return "Закрыть"
        case "sr": return "Затвори"
        default: return "Close"
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

    nonisolated static func open(_ lang: String) -> String {
        switch lang {
        case "es": return "Abrir"
        case "ru": return "Открыть"
        case "sr": return "Отвори"
        default: return "Open"
        }
    }

    nonisolated static func view(_ lang: String) -> String {
        switch lang {
        case "es": return "Ver"
        case "ru": return "Смотреть"
        case "sr": return "Погледај"
        default: return "View"
        }
    }

    nonisolated static func sets(_ lang: String) -> String {
        switch lang {
        case "es": return "Sets"
        case "ru": return "Сеты"
        case "sr": return "Сетови"
        default: return "Sets"
        }
    }

    nonisolated static func setLabel(_ lang: String, number: Int) -> String {
        switch lang {
        case "es": return "Set \(number)"
        case "ru": return "Сет \(number)"
        case "sr": return "Сет \(number)"
        default: return "Set \(number)"
        }
    }

    nonisolated static func teamAPlus(_ lang: String) -> String {
        switch lang {
        case "es": return "Equipo A +"
        case "ru": return "Команда A +"
        case "sr": return "Тим A +"
        default: return "Team A +"
        }
    }

    nonisolated static func teamBPlus(_ lang: String) -> String {
        switch lang {
        case "es": return "Equipo B +"
        case "ru": return "Команда B +"
        case "sr": return "Тим B +"
        default: return "Team B +"
        }
    }

    nonisolated static func tieBreak(_ lang: String) -> String {
        switch lang {
        case "es": return "Tie-break"
        case "ru": return "Тай-брейк"
        case "sr": return "Тај-брејк"
        default: return "Tie-break"
        }
    }

    nonisolated static func saveSet(_ lang: String) -> String {
        switch lang {
        case "es": return "Guardar set"
        case "ru": return "Сохранить сет"
        case "sr": return "Сачувај сет"
        default: return "Save Set"
        }
    }

    nonisolated static func nextSet(_ lang: String) -> String {
        switch lang {
        case "es": return "Siguiente set"
        case "ru": return "Следующий сет"
        case "sr": return "Следећи сет"
        default: return "Next Set"
        }
    }

    nonisolated static func saving(_ lang: String) -> String {
        switch lang {
        case "es": return "Guardando..."
        case "ru": return "Сохранение..."
        case "sr": return "Чување..."
        default: return "Saving..."
        }
    }

    nonisolated static func deuce(_ lang: String) -> String {
        switch lang {
        case "es": return "Iguales"
        case "ru": return "Ровно"
        case "sr": return "Изједначење"
        default: return "Deuce"
        }
    }

    nonisolated static func advantageA(_ lang: String) -> String {
        switch lang {
        case "es": return "Ventaja A"
        case "ru": return "Преимущество A"
        case "sr": return "Предност A"
        default: return "Advantage A"
        }
    }

    nonisolated static func advantageB(_ lang: String) -> String {
        switch lang {
        case "es": return "Ventaja B"
        case "ru": return "Преимущество B"
        case "sr": return "Предност B"
        default: return "Advantage B"
        }
    }

    nonisolated static func advantageAbbrev(_ lang: String) -> String {
        switch lang {
        case "es": return "Vent."
        case "ru": return "Пр-во"
        case "sr": return "Пред."
        default: return "Adv"
        }
    }

    nonisolated static func americano(_ lang: String) -> String {
        switch lang {
        case "es": return "Americano"
        case "ru": return "Американо"
        case "sr": return "Американо"
        default: return "Americano"
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
