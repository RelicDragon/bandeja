import Foundation

/// Watch UI copy. Supported UI languages: en (default), es, ru, sr (Cyrillic), cs.
/// Spanish: Game (the event) = "partida"; Match (one match inside it) = "partido"; tennis game = "juego".
enum WatchCopy {
    nonisolated static func sectionToday(_ lang: String) -> String {
        switch lang {
        case "es": return "Hoy"
        case "ru": return "Сегодня"
        case "sr": return "Данас"
        case "cs": return "Dnes"
        default: return "Today"
        }
    }

    nonisolated static func sectionUpcoming(_ lang: String) -> String {
        switch lang {
        case "es": return "Próximas"
        case "ru": return "Предстоящие"
        case "sr": return "Предстојећи"
        case "cs": return "Nadcházející"
        default: return "Upcoming"
        }
    }

    nonisolated static func sectionRecent(_ lang: String) -> String {
        switch lang {
        case "es": return "Recientes"
        case "ru": return "Недавние"
        case "sr": return "Недавни"
        case "cs": return "Nedávné"
        default: return "Recent"
        }
    }

    nonisolated static func navTitle(_ lang: String) -> String {
        "Bandeja"
    }

    nonisolated static func loadingGames(_ lang: String) -> String {
        switch lang {
        case "es": return "Cargando partidas…"
        case "ru": return "Загрузка игр…"
        case "sr": return "Учитавање игара…"
        case "cs": return "Načítání her…"
        default: return "Loading games…"
        }
    }

    nonisolated static func noUpcomingGames(_ lang: String) -> String {
        switch lang {
        case "es": return "No hay partidas próximas"
        case "ru": return "Нет предстоящих игр"
        case "sr": return "Нема предстојећих игара"
        case "cs": return "Žádné nadcházející hry"
        default: return "No upcoming games"
        }
    }

    nonisolated static func retry(_ lang: String) -> String {
        switch lang {
        case "es": return "Reintentar"
        case "ru": return "Повторить"
        case "sr": return "Покушај поново"
        case "cs": return "Zkusit znovu"
        default: return "Retry"
        }
    }

    nonisolated static func refresh(_ lang: String) -> String {
        switch lang {
        case "es": return "Actualizar"
        case "ru": return "Обновить"
        case "sr": return "Освежи"
        case "cs": return "Obnovit"
        default: return "Refresh"
        }
    }

    nonisolated static func signInRequired(_ lang: String) -> String {
        switch lang {
        case "es": return "Inicia sesión"
        case "ru": return "Вход"
        case "sr": return "Пријава"
        case "cs": return "Přihlášení"
        default: return "Sign In Required"
        }
    }

    nonisolated static func openOnIPhone(_ lang: String) -> String {
        switch lang {
        case "es": return "Abre Bandeja en el iPhone para iniciar sesión."
        case "ru": return "Откройте Bandeja на iPhone для входа."
        case "sr": return "Отворите Bandeja на iPhone-у за пријаву."
        case "cs": return "Otevřete Bandeja na iPhonu a přihlaste se."
        default: return "Open Bandeja on your iPhone to sign in."
        }
    }

    nonisolated static func loadingEllipsis(_ lang: String) -> String {
        switch lang {
        case "es": return "Cargando…"
        case "ru": return "Загрузка…"
        case "sr": return "Учитавање…"
        case "cs": return "Načítání…"
        default: return "Loading…"
        }
    }

    nonisolated static func gameTitle(_ lang: String) -> String {
        switch lang {
        case "es": return "Partida"
        case "ru": return "Игра"
        case "sr": return "Игра"
        case "cs": return "Hra"
        default: return "Game"
        }
    }

    nonisolated static func matches(_ lang: String) -> String {
        switch lang {
        case "es": return "Partidos"
        case "ru": return "Матчи"
        case "sr": return "Мечеви"
        case "cs": return "Zápasy"
        default: return "Matches"
        }
    }

    nonisolated static func scoresPreview(_ lang: String) -> String {
        switch lang {
        case "es": return "Marcador"
        case "ru": return "Счёт"
        case "sr": return "Резултат"
        case "cs": return "Skóre"
        default: return "Scores"
        }
    }

    nonisolated static func roundMatch(_ lang: String, round: Int, match: Int) -> String {
        switch lang {
        case "es": return "R\(round) · P\(match)"
        case "ru": return "Р\(round) · М\(match)"
        case "sr": return "Р\(round) · М\(match)"
        case "cs": return "K\(round) · Z\(match)"
        default: return "R\(round) · M\(match)"
        }
    }

    nonisolated static func waitingForRound(_ lang: String) -> String {
        switch lang {
        case "es": return "Esperando a que empiece la ronda…"
        case "ru": return "Ожидание начала раунда…"
        case "sr": return "Чека се почетак рунде…"
        case "cs": return "Čeká se na začátek kola…"
        default: return "Waiting for round start…"
        }
    }

    nonisolated static func finalizingResults(_ lang: String) -> String {
        switch lang {
        case "es": return "Finalizando…"
        case "ru": return "Завершение…"
        case "sr": return "Завршавање…"
        case "cs": return "Dokončování…"
        default: return "Finalizing…"
        }
    }

    nonisolated static func finalizeResults(_ lang: String) -> String {
        switch lang {
        case "es": return "Finalizar resultados"
        case "ru": return "Завершить результаты"
        case "sr": return "Заврши резултате"
        case "cs": return "Dokončit výsledky"
        default: return "Finalize Results"
        }
    }

    nonisolated static func workoutBandejaSyncPending(_ lang: String) -> String {
        switch lang {
        case "es": return "Entreno en Salud. Sincronizando con Bandeja…"
        case "ru": return "Тренировка в «Здоровье». Синхронизация с Bandeja…"
        case "sr": return "Тренинг у Здрављу. Синхронизација са Bandeja…"
        case "cs": return "Trénink uložen do Zdraví. Synchronizace s Bandeja…"
        default: return "Workout saved to Health. Syncing to Bandeja…"
        }
    }

    nonisolated static func offline(_ lang: String) -> String {
        switch lang {
        case "es": return "Sin conexión"
        case "ru": return "Офлайн"
        case "sr": return "Ван мреже"
        case "cs": return "Offline"
        default: return "Offline"
        }
    }

    nonisolated static func scoresSyncPending(_ lang: String) -> String {
        switch lang {
        case "es": return "Puntuaciones: se enviarán al volver la conexión…"
        case "ru": return "Счёт: отправится при появлении сети…"
        case "sr": return "Резултати: шаљу се када се мрежа врати…"
        case "cs": return "Skóre se odešle, až budete online…"
        default: return "Scores will sync when you’re back online…"
        }
    }

    nonisolated static func resultsRefreshFailed(_ lang: String) -> String {
        switch lang {
        case "es": return "Resultados guardados. Pulsa Actualizar."
        case "ru": return "Результаты сохранены. Нажмите «Обновить»."
        case "sr": return "Резултати сачувани. Додирните „Освежи“."
        case "cs": return "Výsledky uloženy. Klepněte na Obnovit."
        default: return "Results saved. Tap Refresh."
        }
    }

    nonisolated static func resultsServerProcessing(_ lang: String) -> String {
        switch lang {
        case "es": return "Procesando resultados en el servidor…"
        case "ru": return "Сервер обрабатывает результаты…"
        case "sr": return "Сервер обрађује резултате…"
        case "cs": return "Server stále zpracovává výsledky…"
        default: return "Server is still processing results…"
        }
    }

    nonisolated static func outcomes(_ lang: String) -> String {
        switch lang {
        case "es": return "Resultados"
        case "ru": return "Итоги"
        case "sr": return "Исходи"
        case "cs": return "Výsledky"
        default: return "Outcomes"
        }
    }

    nonisolated static func match(_ lang: String) -> String {
        switch lang {
        case "es": return "Partido"
        case "ru": return "Матч"
        case "sr": return "Меч"
        case "cs": return "Zápas"
        default: return "Match"
        }
    }

    nonisolated static func review(_ lang: String) -> String {
        switch lang {
        case "es": return "Revisar"
        case "ru": return "Проверка"
        case "sr": return "Провера"
        case "cs": return "Kontrola"
        default: return "Review"
        }
    }

    nonisolated static func finishMatch(_ lang: String) -> String {
        switch lang {
        case "es": return "Terminar partido"
        case "ru": return "Завершить матч"
        case "sr": return "Заврши меч"
        case "cs": return "Ukončit zápas"
        default: return "Finish Match"
        }
    }

    nonisolated static func leaveMatch(_ lang: String) -> String {
        switch lang {
        case "es": return "Salir del partido"
        case "ru": return "Покинуть матч"
        case "sr": return "Напусти меч"
        case "cs": return "Opustit zápas"
        default: return "Leave match"
        }
    }

    nonisolated static func leaveMatchConfirm(_ lang: String) -> String {
        switch lang {
        case "es": return "¿Salir sin guardar el marcador de este partido?"
        case "ru": return "Выйти, не сохранив счёт этого матча?"
        case "sr": return "Напустити без чувања резултата овог меча?"
        case "cs": return "Opustit bez uložení skóre tohoto zápasu?"
        default: return "Leave without saving this match’s score?"
        }
    }

    nonisolated static func openGameFromWidgetTitle(_ lang: String) -> String {
        switch lang {
        case "es": return "¿Salir de la partida actual?"
        case "ru": return "Покинуть текущую игру?"
        case "sr": return "Напустити тренутну игру?"
        case "cs": return "Opustit aktuální hru?"
        default: return "Leave current game?"
        }
    }

    nonisolated static func openGameFromWidgetMessage(_ lang: String) -> String {
        switch lang {
        case "es": return "Se descartarán la sesión activa y el entrenamiento."
        case "ru": return "Активная сессия и тренировка будут сброшены."
        case "sr": return "Активна сесија и тренинг биће одбачени."
        case "cs": return "Aktivní relace a trénink budou zahozeny."
        default: return "Your active session and workout will be discarded."
        }
    }

    nonisolated static func matchTimerError(_ lang: String) -> String {
        switch lang {
        case "es": return "Error del temporizador del partido"
        case "ru": return "Ошибка таймера матча"
        case "sr": return "Грешка тајмера меча"
        case "cs": return "Chyba časovače zápasu"
        default: return "Match timer error"
        }
    }

    nonisolated static func sessionWaitFirstMatch(_ lang: String) -> String {
        switch lang {
        case "es": return "Pulsa Inicio en un partido"
        case "ru": return "Начните матч"
        case "sr": return "Покрени меч"
        case "cs": return "Spusťte zápas"
        default: return "Start a match"
        }
    }

    nonisolated static func workoutHealthDenied(_ lang: String) -> String {
        switch lang {
        case "es": return "Activa Salud para medir el entrenamiento"
        case "ru": return "Разрешите Здоровье для тренировки"
        case "sr": return "Дозволи Здравље за тренинг"
        case "cs": return "Povolte Zdraví pro sledování tréninku"
        default: return "Allow Health to track workout"
        }
    }

    nonisolated static func workoutHealthDeniedSettingsHint(_ lang: String) -> String {
        switch lang {
        case "es": return "Ajustes › Salud › Apps › Bandeja"
        case "ru": return "Настройки › Здоровье › Приложения › Bandeja"
        case "sr": return "Подешавања › Здравље › Апликације › Bandeja"
        case "cs": return "Nastavení › Zdraví › Aplikace › Bandeja"
        default: return "Settings › Health › Apps › Bandeja"
        }
    }

    nonisolated static func workoutNotTracking(_ lang: String) -> String {
        switch lang {
        case "es": return "Entrenamiento no iniciado"
        case "ru": return "Тренировка не запущена"
        case "sr": return "Тренинг није покренут"
        case "cs": return "Trénink nebyl spuštěn"
        default: return "Workout not started"
        }
    }

    nonisolated static func sessionFinishGame(_ lang: String) -> String {
        switch lang {
        case "es": return "Finalizar partida"
        case "ru": return "Завершить игру"
        case "sr": return "Заврши игру"
        case "cs": return "Ukončit hru"
        default: return "Finish game"
        }
    }

    nonisolated static func sessionExitScoring(_ lang: String) -> String {
        switch lang {
        case "es": return "Salir"
        case "ru": return "Выйти"
        case "sr": return "Изађи"
        case "cs": return "Odejít"
        default: return "Exit"
        }
    }

    nonisolated static func sessionNeedScoresToFinalize(_ lang: String) -> String {
        switch lang {
        case "es": return "Marca al menos un partido para finalizar."
        case "ru": return "Введите счёт хотя бы в одном матче."
        case "sr": return "Унесите резултат бар у једном мечу."
        case "cs": return "Pro dokončení zadejte skóre alespoň jednoho zápasu."
        default: return "Enter at least one match score to finalize."
        }
    }

    nonisolated static func sessionCannotFinishReadOnly(_ lang: String) -> String {
        switch lang {
        case "es": return "No puedes cerrar este partido aquí."
        case "ru": return "Нельзя завершить этот матч здесь."
        case "sr": return "Не можете завршити овај меч овде."
        case "cs": return "Tento zápas zde nelze ukončit."
        default: return "You can’t finish this match here."
        }
    }

    nonisolated static func backToScoring(_ lang: String) -> String {
        switch lang {
        case "es": return "Volver al marcador"
        case "ru": return "Назад к счёту"
        case "sr": return "Назад на бодовање"
        case "cs": return "Zpět ke skóre"
        default: return "Back to Scoring"
        }
    }

    nonisolated static func backToMatches(_ lang: String) -> String {
        switch lang {
        case "es": return "Volver a partidos"
        case "ru": return "К матчам"
        case "sr": return "Назад на мечеве"
        case "cs": return "Zpět na zápasy"
        default: return "Back to matches"
        }
    }

    nonisolated static func close(_ lang: String) -> String {
        switch lang {
        case "es": return "Cerrar"
        case "ru": return "Закрыть"
        case "sr": return "Затвори"
        case "cs": return "Zavřít"
        default: return "Close"
        }
    }

    nonisolated static func now(_ lang: String) -> String {
        switch lang {
        case "es": return "Ahora"
        case "ru": return "Сейчас"
        case "sr": return "Сада"
        case "cs": return "Nyní"
        default: return "Now"
        }
    }

    nonisolated static func gameEnded(_ lang: String) -> String {
        switch lang {
        case "es": return "Terminada"
        case "ru": return "Завершено"
        case "sr": return "Завршено"
        case "cs": return "Ukončeno"
        default: return "Ended"
        }
    }

    nonisolated static func open(_ lang: String) -> String {
        switch lang {
        case "es": return "Abrir"
        case "ru": return "Открыть"
        case "sr": return "Отвори"
        case "cs": return "Otevřít"
        default: return "Open"
        }
    }

    nonisolated static func view(_ lang: String) -> String {
        switch lang {
        case "es": return "Ver"
        case "ru": return "Смотреть"
        case "sr": return "Погледај"
        case "cs": return "Zobrazit"
        default: return "View"
        }
    }

    nonisolated static func score(_ lang: String) -> String {
        switch lang {
        case "es": return "Marcar"
        case "ru": return "Внести счёт"
        case "sr": return "Унеси"
        case "cs": return "Zapsat skóre"
        default: return "Score"
        }
    }

    nonisolated static func edit(_ lang: String) -> String {
        switch lang {
        case "es": return "Editar"
        case "ru": return "Изменить"
        case "sr": return "Измени"
        case "cs": return "Upravit"
        default: return "Edit"
        }
    }

    nonisolated static func roundSection(_ lang: String, number: Int) -> String {
        switch lang {
        case "es": return "Ronda \(number)"
        case "ru": return "Раунд \(number)"
        case "sr": return "Рунда \(number)"
        case "cs": return "Kolo \(number)"
        default: return "Round \(number)"
        }
    }

    nonisolated static func viewOnlyFinal(_ lang: String) -> String {
        switch lang {
        case "es": return "Los resultados están cerrados. Solo lectura."
        case "ru": return "Итоги зафиксированы. Только просмотр."
        case "sr": return "Резултати су коначни. Само преглед."
        case "cs": return "Výsledky jsou konečné. Pouze pro čtení."
        default: return "Results are final. View only."
        }
    }

    nonisolated static func viewOnlyNotOnMatch(_ lang: String) -> String {
        switch lang {
        case "es": return "No estás en este partido."
        case "ru": return "Вы не участвуете в этом матче."
        case "sr": return "Нисте на овом мечу."
        case "cs": return "V tomto zápase nehrajete."
        default: return "You're not on this match."
        }
    }

    nonisolated static func sets(_ lang: String) -> String {
        switch lang {
        case "es": return "Sets"
        case "ru": return "Сеты"
        case "sr": return "Сетови"
        case "cs": return "Sety"
        default: return "Sets"
        }
    }

    nonisolated static func setLabel(_ lang: String, number: Int) -> String {
        switch lang {
        case "es": return "Set \(number)"
        case "ru": return "Сет \(number)"
        case "sr": return "Сет \(number)"
        case "cs": return "Set \(number)"
        default: return "Set \(number)"
        }
    }

    nonisolated static func supplementalGamesBanner(_ lang: String) -> String {
        switch lang {
        case "es": return "Juegos extra"
        case "ru": return "Доп. геймы"
        case "sr": return "Дод. гемови"
        case "cs": return "Gemy navíc"
        default: return "Extra games"
        }
    }

    nonisolated static func supplementalBallsBanner(_ lang: String) -> String {
        switch lang {
        case "es": return "Pelotas extra"
        case "ru": return "Доп. очки"
        case "sr": return "Дод. поени"
        case "cs": return "Body navíc"
        default: return "Extra balls"
        }
    }

    nonisolated static func supplementalBanner(_ lang: String, role: WatchMatchSetRole) -> String {
        switch role {
        case .official: return ""
        case .extraGames: return supplementalGamesBanner(lang)
        case .extraBalls: return supplementalBallsBanner(lang)
        }
    }

    nonisolated static func setReviewLabel(_ lang: String, oneBasedIndex: Int, role: WatchMatchSetRole?) -> String {
        switch role ?? .official {
        case .official: return setLabel(lang, number: oneBasedIndex)
        case .extraGames: return supplementalGamesBanner(lang)
        case .extraBalls: return supplementalBallsBanner(lang)
        }
    }

    nonisolated static func addExtraGamesRow(_ lang: String) -> String {
        switch lang {
        case "es": return "Añadir juegos extra"
        case "ru": return "Добавить геймы"
        case "sr": return "Додај гемове"
        case "cs": return "Přidat gemy navíc"
        default: return "Add extra games"
        }
    }

    nonisolated static func addExtraBallsRow(_ lang: String) -> String {
        switch lang {
        case "es": return "Añadir pelotas extra"
        case "ru": return "Добавить очки"
        case "sr": return "Додај поене"
        case "cs": return "Přidat body navíc"
        default: return "Add extra balls"
        }
    }

    nonisolated static func teamAPlus(_ lang: String) -> String {
        switch lang {
        case "es": return "Equipo A +"
        case "ru": return "Команда A +"
        case "sr": return "Тим A +"
        case "cs": return "Tým A +"
        default: return "Team A +"
        }
    }

    nonisolated static func teamBPlus(_ lang: String) -> String {
        switch lang {
        case "es": return "Equipo B +"
        case "ru": return "Команда B +"
        case "sr": return "Тим B +"
        case "cs": return "Tým B +"
        default: return "Team B +"
        }
    }

    nonisolated static func tieBreak(_ lang: String) -> String {
        switch lang {
        case "es": return "Tie-break"
        case "ru": return "Тай-брейк"
        case "sr": return "Тај-брејк"
        case "cs": return "Tie-break"
        default: return "Tie-break"
        }
    }

    nonisolated static func superTieBreak(_ lang: String) -> String {
        switch lang {
        case "es": return "Super tie-break"
        case "ru": return "Супер тай-брейк"
        case "sr": return "Супер тај-брејк"
        case "cs": return "Super tie-break"
        default: return "Super tie-break"
        }
    }

    nonisolated static func automaticRecordModeTitle(_ lang: String) -> String {
        switch lang {
        case "cs": return "Jak zapisovat skóre?"
        case "es": return "¿Cómo puntúas?"
        case "ru": return "Как считаете очки?"
        case "sr": return "Како бележите поене?"
        default: return "How are you scoring?"
        }
    }

    nonisolated static func automaticRecordModeMessage(_ lang: String) -> String {
        switch lang {
        case "cs": return "Klasické sety/gemy, nebo body Americano."
        case "es": return "Set/juegos clásicos o puntos americano."
        case "ru": return "Классические геймы или очки американо."
        case "sr": return "Класични гемови или американо поени."
        default: return "Classic set/games or americano points."
        }
    }

    nonisolated static func automaticRecordModeGames(_ lang: String) -> String {
        switch lang {
        case "cs": return "Set / gemy"
        case "es": return "Set / juegos"
        case "ru": return "Сет / геймы"
        case "sr": return "Сет / гемови"
        default: return "Set / games"
        }
    }

    nonisolated static func automaticRecordModeAmericano(_ lang: String) -> String {
        switch lang {
        case "cs": return "Body Americano"
        case "es": return "Puntos americano"
        case "ru": return "Очки американо"
        case "sr": return "Американо поени"
        default: return "Americano points"
        }
    }

    /// Tappable row that re-opens the record-mode dialog after it was dismissed.
    nonisolated static func automaticRecordModeOpenPrompt(_ lang: String) -> String {
        switch lang {
        case "cs": return "Zvolit formát"
        case "es": return "Elegir formato"
        case "ru": return "Выбрать формат"
        case "sr": return "Изабери формат"
        default: return "Choose format"
        }
    }

    nonisolated static func automaticContinueTitle(_ lang: String) -> String {
        switch lang {
        case "cs": return "Další set?"
        case "es": return "¿Siguiente set?"
        case "ru": return "Следующий сет?"
        case "sr": return "Следећи сет?"
        default: return "Continue to next set?"
        }
    }

    nonisolated static func automaticContinueMessage(_ lang: String) -> String {
        switch lang {
        case "cs": return "Set skončil. Další set, nebo ukončit zápas."
        case "es": return "Este set terminó. Jugar otro o terminar el partido."
        case "ru": return "Сет закончен. Ещё сет или завершить матч."
        case "sr": return "Сет је готов. Још један сет или крај меча."
        default: return "This set is finished. Play another set, or end the match."
        }
    }

    /// Tappable row that re-opens the continue/end dialog after it was dismissed.
    nonisolated static func automaticContinueOpenPrompt(_ lang: String) -> String {
        switch lang {
        case "cs": return "Pokračovat, nebo ukončit?"
        case "es": return "¿Continuar o terminar?"
        case "ru": return "Продолжить или завершить?"
        case "sr": return "Наставити или завршити?"
        default: return "Continue or end?"
        }
    }

    nonisolated static func automaticContinueCta(_ lang: String) -> String {
        switch lang {
        case "cs": return "Další set"
        case "es": return "Siguiente set"
        case "ru": return "Следующий сет"
        case "sr": return "Следећи сет"
        default: return "Continue to next set"
        }
    }

    nonisolated static func automaticEndCta(_ lang: String) -> String {
        switch lang {
        case "cs": return "Ukončit zápas"
        case "es": return "Terminar partido"
        case "ru": return "Завершить матч"
        case "sr": return "Заврши меч"
        default: return "End match"
        }
    }

    nonisolated static func automaticFinishSetCta(_ lang: String) -> String {
        switch lang {
        case "cs": return "Ukončit set s tímto skóre"
        case "es": return "Cerrar set con este marcador"
        case "ru": return "Завершить сет с этим счётом"
        case "sr": return "Заврши сет са овим резултатом"
        default: return "Finish set at current score"
        }
    }

    nonisolated static func setFormatChoiceTitle(_ lang: String) -> String {
        switch lang {
        case "cs": return "Typ setu"
        case "es": return "Tipo de set"
        case "ru": return "Тип сета"
        case "sr": return "Тип сета"
        default: return "Set type"
        }
    }

    nonisolated static func setFormatChoiceMessage(_ lang: String) -> String {
        switch lang {
        case "cs": return "Stav setů je vyrovnaný. Jak hrát rozhodující set?"
        case "es": return "Sets empatados. ¿Cómo se juega el decisivo?"
        case "ru": return "Счёт по сетам равный. Как играть решающий сет?"
        case "sr": return "Сетови су изједначени. Како играти одлучујући сет?"
        default: return "Sets are split. How should the deciding set be played?"
        }
    }

    nonisolated static func normalSetChoice(_ lang: String) -> String {
        switch lang {
        case "cs": return "Běžný set (gemy)"
        case "es": return "Set normal (juegos)"
        case "ru": return "Обычный сет (геймы)"
        case "sr": return "Нормалан сет (гемови)"
        default: return "Normal set (games)"
        }
    }

    nonisolated static func automaticDeciderPointsChoice(_ lang: String) -> String {
        switch lang {
        case "cs": return "Další bodový set"
        case "es": return "Otro set de puntos"
        case "ru": return "Ещё сет на очки"
        case "sr": return "Још један сет поена"
        default: return "Another points set"
        }
    }

    nonisolated static func superTieBreakChoice(_ lang: String) -> String {
        switch lang {
        case "cs": return "Super tie-break (do 10, rozdíl 2)"
        case "es": return "Super tie-break (a 10, diferencia 2)"
        case "ru": return "Супер ТБ (до 10, разница 2)"
        case "sr": return "Супер ТБ (до 10, разлика 2)"
        default: return "Super tie-break (to 10, win by 2)"
        }
    }

    nonisolated static func saveSet(_ lang: String) -> String {
        switch lang {
        case "es": return "Guardar set"
        case "ru": return "Сохранить сет"
        case "sr": return "Сачувај сет"
        case "cs": return "Uložit set"
        default: return "Save Set"
        }
    }

    nonisolated static func nextSet(_ lang: String) -> String {
        switch lang {
        case "es": return "Siguiente set"
        case "ru": return "Следующий сет"
        case "sr": return "Следећи сет"
        case "cs": return "Další set"
        default: return "Next Set"
        }
    }

    nonisolated static func setWord(_ lang: String) -> String {
        switch lang {
        case "es": return "Set"
        case "ru": return "Сет"
        case "sr": return "Сет"
        case "cs": return "Set"
        default: return "Set"
        }
    }

    nonisolated static func moreScoringActions(_ lang: String) -> String {
        switch lang {
        case "es": return "Más"
        case "ru": return "Ещё"
        case "sr": return "Још"
        case "cs": return "Více"
        default: return "More"
        }
    }

    nonisolated static func saving(_ lang: String) -> String {
        switch lang {
        case "es": return "Guardando…"
        case "ru": return "Сохранение…"
        case "sr": return "Чување…"
        case "cs": return "Ukládání…"
        default: return "Saving…"
        }
    }

    nonisolated static func deuce(_ lang: String) -> String {
        switch lang {
        case "es": return "Iguales"
        case "ru": return "Ровно"
        case "sr": return "Изједначење"
        case "cs": return "Shoda"
        default: return "Deuce"
        }
    }

    /// Golden point at 40–40 (same center label as web `getClassicPointLabels`).
    nonisolated static func goldenPoint(_: String) -> String { "GP" }

    nonisolated static func gameWonConfirmAlertTitle(_ lang: String) -> String {
        switch lang {
        case "es": return "¿Contar juego?"
        case "ru": return "Засчитать гейм?"
        case "sr": return "Уписати гем?"
        case "cs": return "Započítat gem?"
        default: return "Award game?"
        }
    }

    nonisolated static func gameWonConfirmWonLabel(_ lang: String, playerCount: Int) -> String {
        let plural = playerCount > 1
        switch lang {
        case "es": return plural ? "Ganaron" : "Ganó"
        case "ru": return plural ? "Выиграли" : "Победа"
        case "sr": return plural ? "Победили" : "Победа"
        case "cs": return plural ? "Vyhráli" : "Vyhrál"
        default: return plural ? "Team won" : "Player won"
        }
    }

    nonisolated static func gameWonSetScoreWillBe(_ lang: String, teamA: Int, teamB: Int) -> String {
        switch lang {
        case "es": return "El marcador del set será \(teamA):\(teamB)."
        case "ru": return "Счёт в сете будет \(teamA):\(teamB)."
        case "sr": return "Резултат у сету биће \(teamA):\(teamB)."
        case "cs": return "Stav setu bude \(teamA):\(teamB)."
        default: return "Set score will be \(teamA):\(teamB)."
        }
    }

    nonisolated static func gameWonUnknownSide(_ lang: String) -> String {
        switch lang {
        case "es": return "Este bando"
        case "ru": return "Эта сторона"
        case "sr": return "Ова страна"
        case "cs": return "Tato strana"
        default: return "This side"
        }
    }

    nonisolated static func confirmAction(_ lang: String) -> String {
        switch lang {
        case "es": return "Confirmar"
        case "ru": return "Подтвердить"
        case "sr": return "Потврди"
        case "cs": return "Potvrdit"
        default: return "Confirm"
        }
    }

    nonisolated static func cancelAction(_ lang: String) -> String {
        switch lang {
        case "es": return "Cancelar"
        case "ru": return "Отмена"
        case "sr": return "Откажи"
        case "cs": return "Zrušit"
        default: return "Cancel"
        }
    }

    nonisolated static func advantageA(_ lang: String) -> String {
        switch lang {
        case "es": return "Ventaja A"
        case "ru": return "Преимущество A"
        case "sr": return "Предност A"
        case "cs": return "Výhoda A"
        default: return "Advantage A"
        }
    }

    nonisolated static func advantageB(_ lang: String) -> String {
        switch lang {
        case "es": return "Ventaja B"
        case "ru": return "Преимущество B"
        case "sr": return "Предност B"
        case "cs": return "Výhoda B"
        default: return "Advantage B"
        }
    }

    nonisolated static func advantageAbbrev(_ lang: String) -> String {
        switch lang {
        case "es": return "Vent."
        case "ru": return "Пр-во"
        case "sr": return "Пред."
        case "cs": return "Výh."
        default: return "Adv"
        }
    }

    nonisolated static func americano(_ lang: String) -> String {
        switch lang {
        case "es": return "Americano"
        case "ru": return "Американо"
        case "sr": return "Американо"
        case "cs": return "Americano"
        default: return "Americano"
        }
    }

    nonisolated static func tableTennisScoring(_ lang: String) -> String {
        switch lang {
        case "es": return "Tenis de mesa"
        case "ru": return "Настольный теннис"
        case "sr": return "Стони тенис"
        case "cs": return "Stolní tenis"
        default: return "Table tennis"
        }
    }

    nonisolated static func badmintonScoring(_ lang: String) -> String {
        switch lang {
        case "es": return "Bádminton"
        case "ru": return "Бадминтон"
        case "sr": return "Бадминтон"
        case "cs": return "Badminton"
        default: return "Badminton"
        }
    }

    nonisolated static func pickleballScoring(_ lang: String) -> String {
        switch lang {
        case "es": return "Pickleball"
        case "ru": return "Пиклбол"
        case "sr": return "Пиклбол"
        case "cs": return "Pickleball"
        default: return "Pickleball"
        }
    }

    nonisolated static func squashScoring(_ lang: String) -> String {
        switch lang {
        case "es": return "Squash"
        case "ru": return "Сквош"
        case "sr": return "Сквош"
        case "cs": return "Squash"
        default: return "Squash"
        }
    }

    nonisolated static func pickleballUnderhandServe(_ lang: String) -> String {
        switch lang {
        case "es": return "Saque bajo"
        case "ru": return "Подача снизу"
        case "sr": return "Сервис одоздо"
        case "cs": return "Podání spodem"
        default: return "Underhand serve"
        }
    }

    nonisolated static func pickleballUnderhandServeHint(_ lang: String) -> String {
        switch lang {
        case "es": return "El saque debe ser bajo, contacto bajo la cintura. Diagonal al cuadro contrario. Solo honor — el marcador no cambia."
        case "ru": return "Подача снизу, контакт ниже пояса. По диагонали в квадрат подачи. На доверии — счёт не меняется."
        case "sr": return "Сервис одоздо, контакт испод струка. Дијагонално у супротно поље. На част — резултат се не мења."
        case "cs": return "Podání musí být spodem, kontakt pod pasem. Diagonálně do protějšího pole. Na čest — skóre se nemění."
        default: return "Serve must be underhand, contact below the waist. Diagonal into the opposite service court. Honor system — score unchanged."
        }
    }

    nonisolated static func pickleballSideOut(_ lang: String) -> String {
        switch lang {
        case "es": return "Side-out"
        case "ru": return "Side-out"
        case "sr": return "Side-out"
        case "cs": return "Side-out"
        default: return "Side-out"
        }
    }

    nonisolated static func pickleballSideOutHint(_ lang: String) -> String {
        switch lang {
        case "es": return "En side-out solo anota el equipo que saca; tras perder el punto saca el rival. Aquí son puntos rally — toca cualquier equipo."
        case "ru": return "При side-out очко забивает только подающая команда; после проигрыша подаёт соперник. Здесь rally-очки — нажимайте любую команду."
        case "sr": return "Код side-out поен осваја само тим који сервира; после изгубљеног поена сервира противник. Овде су рели поени — додирните било који тим."
        case "cs": return "Při side-out boduje jen podávající tým; po prohraném míči podává soupeř. Tato tabule používá rally body — klepněte na kterýkoli tým."
        default: return "On side-out only the serving team can score; after losing the rally the other team serves. This board uses rally points — tap either team."
        }
    }

    nonisolated static func pickleballTwoBounce(_ lang: String) -> String {
        switch lang {
        case "es": return "Dos rebotes"
        case "ru": return "Два отскока"
        case "sr": return "Два одскока"
        case "cs": return "Dva odskoky"
        default: return "Two-bounce"
        }
    }

    nonisolated static func pickleballTwoBounceHint(_ lang: String) -> String {
        switch lang {
        case "es": return "La pelota debe botar una vez en cada lado antes del voleo (regla de dos rebotes en la cocina). Solo honor."
        case "ru": return "Мяч должен отскочить по разу на каждой стороне до удара в воздухе (правило двух отскоков). На доверии."
        case "sr": return "Лоптица мора једном да одскочи на свакој страни пре волеја (правило два одскока). На част — резултат се не мења."
        case "cs": return "Míček se musí jednou odrazit na každé straně před volejem (pravidlo dvou odskoků). Na čest — skóre se nemění."
        default: return "The ball must bounce once on each side before a volley (two-bounce rule). Honor system — score unchanged."
        }
    }

    nonisolated static func players(_ lang: String) -> String {
        switch lang {
        case "es": return "Jugadores"
        case "ru": return "Игроки"
        case "sr": return "Играчи"
        case "cs": return "Hráči"
        default: return "Players"
        }
    }

    /// "3 players" with correct plural forms per language.
    nonisolated static func playersCount(_ lang: String, _ n: Int) -> String {
        switch lang {
        case "es":
            return n == 1 ? "1 jugador" : "\(n) jugadores"
        case "ru":
            let mod10 = n % 10, mod100 = n % 100
            if mod10 == 1, mod100 != 11 { return "\(n) игрок" }
            if (2...4).contains(mod10), !(12...14).contains(mod100) { return "\(n) игрока" }
            return "\(n) игроков"
        case "sr":
            let mod10 = n % 10, mod100 = n % 100
            if mod10 == 1, mod100 != 11 { return "\(n) играч" }
            return "\(n) играча"
        case "cs":
            if n == 1 { return "1 hráč" }
            if (2...4).contains(n) { return "\(n) hráči" }
            return "\(n) hráčů"
        default:
            return n == 1 ? "1 player" : "\(n) players"
        }
    }

    /// Row participant label: bar shows a bare count, capped games show "n/max", otherwise "n players".
    nonisolated static func participantCountLabel(lang: String, count: Int, max: Int?, isBar: Bool) -> String {
        if isBar { return "\(count)" }
        if let max { return "\(count)/\(max)" }
        return playersCount(lang, count)
    }

    /// Human-readable game type for raw `Game.gameType` values.
    nonisolated static func gameTypeLabel(_ lang: String, raw: String) -> String {
        switch raw {
        case "AMERICANO":
            switch lang {
            case "es": return "Americano"
            case "ru": return "Американо"
            case "sr": return "Американо"
            case "cs": return "Americano"
            default: return "Americano"
            }
        case "MEXICANO":
            switch lang {
            case "es": return "Mexicano"
            case "ru": return "Мексикано"
            case "sr": return "Мексикано"
            case "cs": return "Mexicano"
            default: return "Mexicano"
            }
        case "ROUND_ROBIN":
            switch lang {
            case "es": return "Todos contra todos"
            case "ru": return "Круговая"
            case "sr": return "Свако са сваким"
            case "cs": return "Každý s každým"
            default: return "Round robin"
            }
        case "WINNER_COURT":
            switch lang {
            case "es": return "Pista del ganador"
            case "ru": return "Корт победителей"
            case "sr": return "Терен победника"
            case "cs": return "Kurt vítězů"
            default: return "Winner court"
            }
        case "LADDER":
            switch lang {
            case "es": return "Escalera"
            case "ru": return "Лестница"
            case "sr": return "Лествица"
            case "cs": return "Žebříček"
            default: return "Ladder"
            }
        case "CLASSIC":
            switch lang {
            case "es": return "Clásico"
            case "ru": return "Классика"
            case "sr": return "Класично"
            case "cs": return "Klasika"
            default: return "Classic"
            }
        case "KOTC":
            switch lang {
            case "es": return "Rey de la pista"
            case "ru": return "Король корта"
            case "sr": return "Краљ терена"
            case "cs": return "Král kurtu"
            default: return "King of the court"
            }
        case "CUSTOM":
            switch lang {
            case "es": return "Personalizado"
            case "ru": return "Свой формат"
            case "sr": return "Прилагођено"
            case "cs": return "Vlastní"
            default: return "Custom"
            }
        default:
            return raw.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    /// Status pill fallback for `Game.status` / `resultsStatus` combinations the UI does not name.
    nonisolated static func statusLabelFallback(_ lang: String) -> String {
        switch lang {
        case "es": return "Desconocido"
        case "ru": return "Неизвестно"
        case "sr": return "Непознато"
        case "cs": return "Neznámý"
        default: return "Unknown"
        }
    }

    nonisolated static func unknownPlayer(_ lang: String) -> String {
        switch lang {
        case "es": return "Jugador desconocido"
        case "ru": return "Неизвестный игрок"
        case "sr": return "Непознат играч"
        case "cs": return "Neznámý hráč"
        default: return "Unknown player"
        }
    }

    nonisolated static func undoPointA11y(_ lang: String) -> String {
        switch lang {
        case "es": return "Deshacer punto"
        case "ru": return "Отменить очко"
        case "sr": return "Поништи поен"
        case "cs": return "Vrátit bod"
        default: return "Undo point"
        }
    }

    nonisolated static func startMatchA11y(_ lang: String) -> String {
        switch lang {
        case "es": return "Empezar partido"
        case "ru": return "Начать матч"
        case "sr": return "Започни меч"
        case "cs": return "Spustit zápas"
        default: return "Start match"
        }
    }

    /// Short tie-break serve slot badge ("S1" / "S2").
    nonisolated static func serveSlotShort(_ lang: String, slot: Int) -> String {
        switch lang {
        case "es": return "S\(slot)"
        case "ru": return "П\(slot)"
        case "sr": return "С\(slot)"
        case "cs": return "P\(slot)"
        default: return "S\(slot)"
        }
    }

    nonisolated static func readinessHeading(_ lang: String) -> String {
        switch lang {
        case "es": return "Preparación"
        case "ru": return "Готовность"
        case "sr": return "Спремност"
        case "cs": return "Připravenost"
        default: return "Readiness"
        }
    }

    nonisolated static func readinessParticipantsOk(_ lang: String) -> String {
        switch lang {
        case "es": return "Jugadores: listos"
        case "ru": return "Игроки: готово"
        case "sr": return "Играчи: спремни"
        case "cs": return "Hráči: připraveni"
        default: return "Players: ready"
        }
    }

    nonisolated static func readinessParticipantsWaiting(_ lang: String, requiredPlaying: Int? = nil) -> String {
        let suffix: String = {
            guard let requiredPlaying else { return "" }
            return " (\(requiredPlaying))"
        }()
        switch lang {
        case "es": return "Jugadores: faltan\(suffix)"
        case "ru": return "Игроки: ждём\(suffix)"
        case "sr": return "Играчи: чека се\(suffix)"
        case "cs": return "Hráči: čeká se\(suffix)"
        default: return "Players: waiting\(suffix)"
        }
    }

    nonisolated static func readinessTeamsOk(_ lang: String) -> String {
        switch lang {
        case "es": return "Equipos: listos"
        case "ru": return "Команды: готово"
        case "sr": return "Тимови: спремни"
        case "cs": return "Týmy: připraveny"
        default: return "Teams: ready"
        }
    }

    nonisolated static func readinessTeamsWaiting(_ lang: String) -> String {
        switch lang {
        case "es": return "Equipos: incompletos"
        case "ru": return "Команды: не готовы"
        case "sr": return "Тимови: нису спремни"
        case "cs": return "Týmy: nesestaveny"
        default: return "Teams: not set"
        }
    }

    nonisolated static func soon(_ lang: String) -> String {
        switch lang {
        case "es": return "Pronto"
        case "ru": return "Скоро"
        case "sr": return "Ускоро"
        case "cs": return "Brzy"
        default: return "Soon"
        }
    }

    nonisolated static func startGame(_ lang: String) -> String {
        switch lang {
        case "es": return "Empezar partida"
        case "ru": return "Начать игру"
        case "sr": return "Започни игру"
        case "cs": return "Zahájit hru"
        default: return "Start Game"
        }
    }

    nonisolated static func enterResults(_ lang: String) -> String {
        switch lang {
        case "es": return "Introducir resultados"
        case "ru": return "Ввести результаты"
        case "sr": return "Унеси резултате"
        case "cs": return "Zadat výsledky"
        default: return "Enter Results"
        }
    }

    nonisolated static func continueScoring(_ lang: String) -> String {
        switch lang {
        case "es": return "Continuar marcador"
        case "ru": return "Продолжить счёт"
        case "sr": return "Настави бодовање"
        case "cs": return "Pokračovat ve skórování"
        default: return "Continue Scoring"
        }
    }

    nonisolated static func resultsFinal(_ lang: String) -> String {
        switch lang {
        case "es": return "Resultados finales"
        case "ru": return "Итоговый результат"
        case "sr": return "Коначан резултат"
        case "cs": return "Konečné výsledky"
        default: return "Results Final"
        }
    }

    nonisolated static func statusAnnounced(_ lang: String) -> String {
        switch lang {
        case "es": return "Anunciada"
        case "ru": return "Анонсирована"
        case "sr": return "Најављено"
        case "cs": return "Oznámeno"
        default: return "Announced"
        }
    }

    nonisolated static func statusInProgress(_ lang: String) -> String {
        switch lang {
        case "es": return "En curso"
        case "ru": return "Идёт"
        case "sr": return "У току"
        case "cs": return "Probíhá"
        default: return "In Progress"
        }
    }

    nonisolated static func statusScoring(_ lang: String) -> String {
        switch lang {
        case "es": return "Marcador"
        case "ru": return "Счёт"
        case "sr": return "Бодовање"
        case "cs": return "Skórování"
        default: return "Scoring"
        }
    }

    nonisolated static func statusFinished(_ lang: String) -> String {
        switch lang {
        case "es": return "Finalizada"
        case "ru": return "Завершено"
        case "sr": return "Завршено"
        case "cs": return "Ukončeno"
        default: return "Finished"
        }
    }

    nonisolated static func statusArchived(_ lang: String) -> String {
        switch lang {
        case "es": return "Archivada"
        case "ru": return "В архиве"
        case "sr": return "Архивирано"
        case "cs": return "Archivováno"
        default: return "Archived"
        }
    }

    nonisolated static func errorSignInOnIPhone(_ lang: String) -> String {
        switch lang {
        case "es": return "Inicia sesión en el iPhone."
        case "ru": return "Войдите на iPhone."
        case "sr": return "Пријавите се на iPhone-у."
        case "cs": return "Přihlaste se na iPhonu."
        default: return "Please sign in on your iPhone."
        }
    }

    nonisolated static func errorServer(_ lang: String, code: Int) -> String {
        switch lang {
        case "es": return "Error del servidor (\(code))."
        case "ru": return "Ошибка сервера (\(code))."
        case "sr": return "Грешка сервера (\(code))."
        case "cs": return "Chyba serveru (\(code))."
        default: return "Server error (\(code))."
        }
    }

    nonisolated static func errorNotSignedIn(_ lang: String) -> String {
        switch lang {
        case "es": return "Sin sesión. Abre Bandeja en el iPhone."
        case "ru": return "Не выполнен вход. Откройте Bandeja на iPhone."
        case "sr": return "Нисте пријављени. Отворите Bandeja на iPhone-у."
        case "cs": return "Nejste přihlášeni. Otevřete Bandeja na iPhonu."
        default: return "Not signed in. Open Bandeja on your iPhone."
        }
    }

    nonisolated static func errorUnexpectedResponse(_ lang: String) -> String {
        switch lang {
        case "es": return "Respuesta inesperada del servidor."
        case "ru": return "Неожиданный ответ сервера."
        case "sr": return "Неочекиван одговор сервера."
        case "cs": return "Neočekávaná odpověď serveru."
        default: return "Unexpected server response."
        }
    }

    nonisolated static func errorLiveScoringOutOfDate(_ lang: String) -> String {
        switch lang {
        case "es": return "Puntuación actualizada en otro dispositivo."
        case "ru": return "Счёт обновлён на другом устройстве."
        case "sr": return "Резултат је ажуриран на другом уређају."
        case "cs": return "Skóre bylo aktualizováno na jiném zařízení."
        default: return "Score was updated on another device."
        }
    }

    nonisolated static func workoutKcal(_ lang: String, value: Int) -> String {
        switch lang {
        case "es": return "\(value) kcal"
        case "ru": return "\(value) ккал"
        case "sr": return "\(value) kcal"
        case "cs": return "\(value) kcal"
        default: return "\(value) kcal"
        }
    }

    nonisolated static func workoutBpm(_ lang: String, value: Int) -> String {
        switch lang {
        case "es": return "\(value) lpm"
        case "ru": return "\(value) уд/мин"
        case "sr": return "\(value) отк/мин"
        case "cs": return "\(value) tepů/min"
        default: return "\(value) bpm"
        }
    }

    nonisolated static func workoutTimerShort(_: String, minutes: Int, seconds: Int) -> String {
        String(format: "%d:%02d", minutes, seconds)
    }

    nonisolated static func workoutPauseA11y(_ lang: String) -> String {
        switch lang {
        case "es": return "Pausar entrenamiento"
        case "ru": return "Приостановить тренировку"
        case "sr": return "Пауза тренинга"
        case "cs": return "Pozastavit trénink"
        default: return "Pause workout"
        }
    }

    nonisolated static func workoutResumeA11y(_ lang: String) -> String {
        switch lang {
        case "es": return "Reanudar entrenamiento"
        case "ru": return "Продолжить тренировку"
        case "sr": return "Настави тренинг"
        case "cs": return "Pokračovat v tréninku"
        default: return "Resume workout"
        }
    }

    nonisolated static func matchTimerStart(_ lang: String) -> String {
        switch lang {
        case "es": return "Iniciar"
        case "ru": return "Старт"
        case "sr": return "Старт"
        case "cs": return "Start"
        default: return "Start"
        }
    }

    nonisolated static func matchTimerPause(_ lang: String) -> String {
        switch lang {
        case "es": return "Pausa"
        case "ru": return "Пауза"
        case "sr": return "Пауза"
        case "cs": return "Pauza"
        default: return "Pause"
        }
    }

    nonisolated static func matchTimerResume(_ lang: String) -> String {
        switch lang {
        case "es": return "Seguir"
        case "ru": return "Продолжить"
        case "sr": return "Настави"
        case "cs": return "Pokračovat"
        default: return "Resume"
        }
    }

    nonisolated static func matchTimerStop(_ lang: String) -> String {
        switch lang {
        case "es": return "Parar"
        case "ru": return "Стоп"
        case "sr": return "Стоп"
        case "cs": return "Stop"
        default: return "Stop"
        }
    }

    nonisolated static func matchTimerReset(_ lang: String) -> String {
        switch lang {
        case "es": return "Reset"
        case "ru": return "Сброс"
        case "sr": return "Ресет"
        case "cs": return "Reset"
        default: return "Reset"
        }
    }

    nonisolated static func serveFirstTitle(_ lang: String) -> String {
        switch lang {
        case "es": return "¿Quién saca primero?"
        case "ru": return "Кто подаёт первым?"
        case "sr": return "Ко први сервира?"
        case "cs": return "Kdo podává první?"
        default: return "Who serves first?"
        }
    }

    nonisolated static func serveFirstBody(_ lang: String) -> String {
        switch lang {
        case "es": return "Te diremos el lado en cada punto. Opcional."
        case "ru": return "Покажем сторону подачи на каждом очке. По желанию."
        case "sr": return "Показаћемо страну сервиса за сваки поен. Опционо."
        case "cs": return "Ukážeme stranu podání u každého bodu. Volitelné."
        default: return "We’ll show serve side each point. Optional."
        }
    }

    nonisolated static func serveRotationRulesLabel(_ lang: String) -> String {
        switch lang {
        case "es": return "Rotación de saque"
        case "ru": return "Ротация подачи"
        case "sr": return "Ротација сервиса"
        case "cs": return "Rotace podání"
        default: return "Serve rotation"
        }
    }

    nonisolated static func serveRotationOfficialTitle(_ lang: String) -> String {
        switch lang {
        case "es": return "Oficial"
        case "ru": return "Официальная"
        case "sr": return "Званична"
        case "cs": return "Oficiální"
        default: return "Official"
        }
    }

    nonisolated static func serveRotationOfficialDesc(_ lang: String) -> String {
        switch lang {
        case "es":
            return "STB: 1 punto el primero; luego 2 por equipo (Saque 1 derecha, Saque 2 izquierda). Cambio cada 6."
        case "ru":
            return "STB: 1 очко первым; затем по 2 на команду (подача 1 справа, 2 слева). Смена сторон каждые 6."
        case "sr":
            return "STB: 1 поен први; затим по 2 по тиму (сервис 1 десно, 2 лево). Промена страна на сваких 6."
        case "cs":
            return "STB: 1 bod první; pak 2 na tým (Pod. 1 vpravo, 2 vlevo). Výměna stran po 6."
        default:
            return "STB: first server 1 pt, then 2 per team (Serve 1 right, Serve 2 left). Change ends every 6."
        }
    }

    nonisolated static func serveRotationSimpleTitle(_ lang: String) -> String {
        switch lang {
        case "es": return "Simple"
        case "ru": return "Простая"
        case "sr": return "Једноставна"
        case "cs": return "Jednoduchá"
        default: return "Simple"
        }
    }

    nonisolated static func serveRotationSimpleDesc(_ lang: String) -> String {
        switch lang {
        case "es": return "Como juego clásico: derecha, izquierda, luego tu compañero."
        case "ru": return "Как в классике: справа, слева, затем партнёр."
        case "sr": return "Као у гему: десно, лево, затим партнер."
        case "cs": return "Jako game: vpravo, vlevo, pak parťák."
        default: return "Like a game: right, left, then your partner."
        }
    }

    nonisolated static func skipServeHints(_ lang: String) -> String {
        switch lang {
        case "es": return "Omitir guía de saque"
        case "ru": return "Без подсказок подачи"
        case "sr": return "Прескочи савете за сервис"
        case "cs": return "Přeskočit nápovědu podání"
        default: return "Skip serve hints"
        }
    }

    nonisolated static func teamAShort(_ lang: String) -> String {
        switch lang {
        case "es": return "Equipo A"
        case "ru": return "Команда A"
        case "sr": return "Тим A"
        case "cs": return "Tým A"
        default: return "Team A"
        }
    }

    nonisolated static func teamBShort(_ lang: String) -> String {
        switch lang {
        case "es": return "Equipo B"
        case "ru": return "Команда B"
        case "sr": return "Тим B"
        case "cs": return "Tým B"
        default: return "Team B"
        }
    }

    nonisolated static func courtEndsTitle(_ lang: String) -> String {
        switch lang {
        case "es": return "Ajusta la pista"
        case "ru": return "Совместите с кортом"
        case "sr": return "Ускладите са тереном"
        case "cs": return "Srovnejte kurt"
        default: return "Match the court"
        }
    }

    nonisolated static func courtEndsBody(_ lang: String) -> String {
        switch lang {
        case "es": return "Equipo A arriba o abajo según estén ahora."
        case "ru": return "Команда A сверху или снизу — как сейчас на корте."
        case "sr": return "Тим A горе или доле — као што сада стоје."
        case "cs": return "Tým A nahoře nebo dole podle toho, kde stojí."
        default: return "Team A on top or bottom — match where they stand."
        }
    }

    nonisolated static func flipCourtVertical(_ lang: String) -> String {
        switch lang {
        case "es": return "Girar fondos"
        case "ru": return "Поменять концы"
        case "sr": return "Замени стране"
        case "cs": return "Otočit konce"
        default: return "Flip ends"
        }
    }

    nonisolated static func flipTeamASides(_ lang: String) -> String {
        switch lang {
        case "es": return "Eq. A ↔"
        case "ru": return "Команда A ↔"
        case "sr": return "Тим A ↔"
        case "cs": return "Tým A ↔"
        default: return "Team A ↔"
        }
    }

    nonisolated static func flipTeamBSides(_ lang: String) -> String {
        switch lang {
        case "es": return "Eq. B ↔"
        case "ru": return "Команда B ↔"
        case "sr": return "Тим B ↔"
        case "cs": return "Tým B ↔"
        default: return "Team B ↔"
        }
    }

    nonisolated static func whoServesFirstGame(_ lang: String) -> String {
        switch lang {
        case "es": return "¿Quién saca este juego?"
        case "ru": return "Кто подаёт в первом гейме?"
        case "sr": return "Ко сервира у првом гему?"
        case "cs": return "Kdo podává v prvním gemu?"
        default: return "Who serves this first game?"
        }
    }

    nonisolated static func continueAction(_ lang: String) -> String {
        switch lang {
        case "es": return "Continuar"
        case "ru": return "Далее"
        case "sr": return "Настави"
        case "cs": return "Pokračovat"
        default: return "Continue"
        }
    }

    nonisolated static func courtRight(_ lang: String) -> String {
        switch lang {
        case "es": return "Derecha"
        case "ru": return "Справа"
        case "sr": return "Десно"
        case "cs": return "Vpravo"
        default: return "Right"
        }
    }

    nonisolated static func courtLeft(_ lang: String) -> String {
        switch lang {
        case "es": return "Izquierda"
        case "ru": return "Слева"
        case "sr": return "Лево"
        case "cs": return "Vlevo"
        default: return "Left"
        }
    }

    nonisolated static func serveCoachChangeEnds(_ lang: String) -> String {
        switch lang {
        case "es": return "Cambiar de lado"
        case "ru": return "Смена сторон"
        case "sr": return "Промена страна"
        case "cs": return "Výměna stran"
        default: return "Change sides"
        }
    }

    nonisolated static func serveCoachHideMatch(_ lang: String) -> String {
        switch lang {
        case "es": return "Ocultar en este partido"
        case "ru": return "Скрыть в этом матче"
        case "sr": return "Сакриј за овај меч"
        case "cs": return "Skrýt pro tento zápas"
        default: return "Hide for this match"
        }
    }

    nonisolated static func serveHintsMenu(_ lang: String) -> String {
        switch lang {
        case "es": return "Guía de saque"
        case "ru": return "Подсказки подачи"
        case "sr": return "Савети за сервис"
        case "cs": return "Nápověda podání"
        default: return "Serve hints"
        }
    }

    nonisolated static func serveHintsOn(_ lang: String) -> String {
        switch lang {
        case "es": return "Completa"
        case "ru": return "Полные"
        case "sr": return "Пуни"
        case "cs": return "Plná"
        default: return "Full"
        }
    }

    nonisolated static func serveHintsCompact(_ lang: String) -> String {
        switch lang {
        case "es": return "Compacta"
        case "ru": return "Компактно"
        case "sr": return "Компактно"
        case "cs": return "Kompaktní"
        default: return "Compact"
        }
    }

    nonisolated static func serveHintsOff(_ lang: String) -> String {
        switch lang {
        case "es": return "Apagada"
        case "ru": return "Выкл."
        case "sr": return "Искључено"
        case "cs": return "Vypnuto"
        default: return "Off"
        }
    }

    nonisolated static func fixStartingServer(_ lang: String) -> String {
        switch lang {
        case "es": return "Corregir saque inicial…"
        case "ru": return "Исправить первую подачу…"
        case "sr": return "Исправи први сервис…"
        case "cs": return "Opravit prvního podávajícího…"
        default: return "Fix starting server…"
        }
    }

    nonisolated static func fixStartingServerConfirm(_ lang: String) -> String {
        switch lang {
        case "es": return "Ya hay juegos marcados. ¿Corregir? La guía se recalculará."
        case "ru": return "В сете уже есть геймы. Исправить? Подсказки пересчитаются."
        case "sr": return "Гемови су већ унети. Исправити? Водич за сервис ће се поново израчунати."
        case "cs": return "Gemy jsou už zadány. Opravit? Nápověda podání se přepočítá."
        default: return "Games are already entered. Fix? Serve guide will recalculate."
        }
    }

    nonisolated static func serveCoachToast(_ lang: String) -> String {
        switch lang {
        case "es": return "Desliza a la derecha para la guía de saque."
        case "ru": return "Смахните вправо для подсказки подачи."
        case "sr": return "Превуците удесно за водич за сервис."
        case "cs": return "Přejeďte doprava pro nápovědu podání."
        default: return "Swipe right for the serve guide."
        }
    }

    nonisolated static func serveGuideUnavailable(_ lang: String) -> String {
        switch lang {
        case "es": return "Guía de saque no disponible."
        case "ru": return "Подсказка подачи недоступна."
        case "sr": return "Водич за сервис није доступан."
        case "cs": return "Nápověda podání není k dispozici."
        default: return "Serve guide unavailable."
        }
    }

    nonisolated static func serveGuideSwipeHint(_ lang: String) -> String {
        switch lang {
        case "es": return "Desliza a la izquierda para volver a puntuar."
        case "ru": return "Смахните влево, чтобы вернуться к счёту."
        case "sr": return "Превуците улево за повратак на бодовање."
        case "cs": return "Přejeďte doleva pro návrat ke skóre."
        default: return "Swipe left to return to scoring."
        }
    }

    nonisolated static func serveGuideHideHint(_ lang: String) -> String {
        switch lang {
        case "es": return "Mantén pulsado para ocultar la guía."
        case "ru": return "Удерживайте, чтобы скрыть подсказку."
        case "sr": return "Дуго притисните да сакријете водич."
        case "cs": return "Dlouhým stiskem skryjete nápovědu."
        default: return "Long press to hide serve guide."
        }
    }

    nonisolated static func liveScoringUpdatedFromPhone(_ lang: String) -> String {
        switch lang {
        case "es": return "Actualizado desde el teléfono"
        case "ru": return "Обновлено с телефона"
        case "sr": return "Ажурирано са телефона"
        case "cs": return "Aktualizováno z telefonu"
        default: return "Updated from phone"
        }
    }

    nonisolated static func serveGuideDisclaimer(_ lang: String) -> String {
        switch lang {
        case "es": return "Orientación; no sustituye reglas del club ni árbitro."
        case "ru": return "Подсказка, не заменяет правила площадки и судью."
        case "sr": return "Помоћ; не замењује правила клуба ни судију."
        case "cs": return "Pomůcka; nenahrazuje pravidla klubu ani rozhodčího."
        default: return "Assistive guidance, not a substitute for venue rules or an umpire."
        }
    }

    nonisolated static func nextServeA11y(_ lang: String, team: String, name: String, side: String) -> String {
        switch lang {
        case "es": return "Próximo saque: \(team), \(name), \(side)."
        case "ru": return "Следующая подача: \(team), \(name), \(side)."
        case "sr": return "Следећи сервис: \(team), \(name), \(side)."
        case "cs": return "Další podání: \(team), \(name), \(side)."
        default: return "Next serve: \(team), \(name), from the \(side)."
        }
    }

    nonisolated static func serveDetailPerspective(_ lang: String) -> String {
        switch lang {
        case "es": return "Derecha/izquierda mirando hacia la red al sacar."
        case "ru": return "Вправо/влево — как вы смотрите на сетку при подаче."
        case "sr": return "Десно/лево је како гледате ка мрежи док сервирате."
        case "cs": return "Vpravo/vlevo je při pohledu na síť během podání."
        default: return "Right/left is as you face the net while serving."
        }
    }

    nonisolated static func serveDetailTbBlock(_ lang: String) -> String {
        switch lang {
        case "es": return "En tie-break, rotación de dos puntos salvo el primero."
        case "ru": return "В тай-брейке — два очка подряд, кроме первого."
        case "sr": return "У тај-брејку ротација по два поена, осим првог."
        case "cs": return "V tie-breaku rotace po dvou bodech kromě prvního."
        default: return "In a tie-break, two-point rotations except the first point."
        }
    }

    nonisolated static func pickleballKitchenFault(_ lang: String) -> String {
        switch lang {
        case "es": return "Falta de cocina"
        case "ru": return "Ошибка в кухне"
        case "sr": return "Грешка у кухињи"
        case "cs": return "Chyba v kuchyni"
        default: return "Kitchen fault"
        }
    }

    nonisolated static func strictKitchenFaultPickTeam(_ lang: String) -> String {
        switch lang {
        case "es": return "Falta de cocina — ¿qué equipo?"
        case "ru": return "Ошибка в кухне — какая команда?"
        case "sr": return "Грешка у кухињи — који тим?"
        case "cs": return "Chyba v kuchyni — který tým?"
        default: return "Kitchen fault — which team?"
        }
    }

    nonisolated static func teamAFault(_ lang: String) -> String {
        switch lang {
        case "es": return "Falta del equipo A"
        case "ru": return "Ошибка команды A"
        case "sr": return "Грешка тима A"
        case "cs": return "Chyba týmu A"
        default: return "Team A fault"
        }
    }

    nonisolated static func teamBFault(_ lang: String) -> String {
        switch lang {
        case "es": return "Falta del equipo B"
        case "ru": return "Ошибка команды B"
        case "sr": return "Грешка тима B"
        case "cs": return "Chyba týmu B"
        default: return "Team B fault"
        }
    }

    nonisolated static func strictLetPending(_ lang: String) -> String {
        switch lang {
        case "es": return "Let — repetid el punto antes de marcar."
        case "ru": return "Лет — сначала переиграйте розыгрыш."
        case "sr": return "Лет — прво поновите поен."
        case "cs": return "Let — nejprve zopakujte míč."
        default: return "Let called — replay the point before scoring."
        }
    }

    nonisolated static func strictLetReplay(_ lang: String) -> String {
        switch lang {
        case "es": return "Repetir punto"
        case "ru": return "Переиграть"
        case "sr": return "Понови поен"
        case "cs": return "Opakovat míč"
        default: return "Replay point"
        }
    }

    nonisolated static func letCall(_ lang: String) -> String {
        switch lang {
        case "es": return "Let"
        case "ru": return "Лет"
        case "sr": return "Лет"
        case "cs": return "Let"
        default: return "Let"
        }
    }

    nonisolated static func serviceFault(_ lang: String) -> String {
        switch lang {
        case "es": return "Falta de saque"
        case "ru": return "Ошибка подачи"
        case "sr": return "Грешка сервиса"
        case "cs": return "Chyba podání"
        default: return "Service fault"
        }
    }

    nonisolated static func weather(_ lang: String) -> String {
        switch lang {
        case "es": return "Tiempo"
        case "ru": return "Погода"
        case "sr": return "Време"
        case "cs": return "Počasí"
        default: return "Weather"
        }
    }

    nonisolated static func weatherRainChance(_ lang: String, probability: Int) -> String {
        switch lang {
        case "es": return "Lluvia \(probability)%"
        case "ru": return "Дождь \(probability)%"
        case "sr": return "Киша \(probability)%"
        case "cs": return "Déšť \(probability)%"
        default: return "Rain \(probability)%"
        }
    }

    nonisolated static func weatherWind(_ lang: String, speedKmh: Int) -> String {
        switch lang {
        case "es": return "Viento \(speedKmh) km/h"
        case "ru": return "Ветер \(speedKmh) км/ч"
        case "sr": return "Ветар \(speedKmh) km/h"
        case "cs": return "Vítr \(speedKmh) km/h"
        default: return "Wind \(speedKmh) km/h"
        }
    }

    nonisolated static func weatherStale(_ lang: String) -> String {
        switch lang {
        case "es": return "Previsión antigua"
        case "ru": return "Устаревший прогноз"
        case "sr": return "Застарела прогноза"
        case "cs": return "Starší předpověď"
        default: return "Stale forecast"
        }
    }

    nonisolated static func weatherCondition(_ lang: String, conditionKey: String) -> String {
        switch conditionKey {
        case "clear":
            switch lang {
            case "es": return "Despejado"
            case "ru": return "Ясно"
            case "sr": return "Ведро"
            case "cs": return "Jasno"
            default: return "Clear"
            }
        case "mainly_clear":
            switch lang {
            case "es": return "Mayormente despejado"
            case "ru": return "Преимущественно ясно"
            case "sr": return "Углавном ведро"
            case "cs": return "Převážně jasno"
            default: return "Mostly clear"
            }
        case "partly_cloudy":
            switch lang {
            case "es": return "Parcialmente nublado"
            case "ru": return "Переменная облачность"
            case "sr": return "Делимично облачно"
            case "cs": return "Polojasno"
            default: return "Partly cloudy"
            }
        case "cloudy":
            switch lang {
            case "es": return "Nublado"
            case "ru": return "Облачно"
            case "sr": return "Облачно"
            case "cs": return "Oblačno"
            default: return "Cloudy"
            }
        case "fog":
            switch lang {
            case "es": return "Niebla"
            case "ru": return "Туман"
            case "sr": return "Магла"
            case "cs": return "Mlha"
            default: return "Fog"
            }
        case "drizzle":
            switch lang {
            case "es": return "Llovizna"
            case "ru": return "Морось"
            case "sr": return "Росуља"
            case "cs": return "Mrholení"
            default: return "Drizzle"
            }
        case "rain":
            switch lang {
            case "es": return "Lluvia"
            case "ru": return "Дождь"
            case "sr": return "Киша"
            case "cs": return "Déšť"
            default: return "Rain"
            }
        case "freezing_rain":
            switch lang {
            case "es": return "Lluvia helada"
            case "ru": return "Ледяной дождь"
            case "sr": return "Ледена киша"
            case "cs": return "Mrznoucí déšť"
            default: return "Freezing rain"
            }
        case "snow":
            switch lang {
            case "es": return "Nieve"
            case "ru": return "Снег"
            case "sr": return "Снег"
            case "cs": return "Sníh"
            default: return "Snow"
            }
        case "showers":
            switch lang {
            case "es": return "Chubascos"
            case "ru": return "Ливни"
            case "sr": return "Пљускови"
            case "cs": return "Přeháňky"
            default: return "Showers"
            }
        case "thunderstorm":
            switch lang {
            case "es": return "Tormenta"
            case "ru": return "Гроза"
            case "sr": return "Грмљавина"
            case "cs": return "Bouřka"
            default: return "Thunderstorm"
            }
        default:
            switch lang {
            case "es": return "Tiempo"
            case "ru": return "Погода"
            case "sr": return "Време"
            case "cs": return "Počasí"
            default: return "Weather"
            }
        }
    }
}
