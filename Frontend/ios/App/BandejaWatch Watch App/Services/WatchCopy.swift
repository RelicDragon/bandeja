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

    nonisolated static func finalizingResults(_ lang: String) -> String {
        switch lang {
        case "es": return "Finalizando…"
        case "ru": return "Завершение…"
        case "sr": return "Завршавање…"
        default: return "Finalizing…"
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

    nonisolated static func workoutBandejaSyncPending(_ lang: String) -> String {
        switch lang {
        case "es": return "Entreno en Salud. Sincronizando con Bandeja…"
        case "ru": return "Тренировка в «Здоровье». Синхронизация с Bandeja…"
        case "sr": return "Тренинг у Здрављу. Синхронизација са Bandeja…"
        default: return "Workout saved to Health. Syncing to Bandeja…"
        }
    }

    nonisolated static func offline(_ lang: String) -> String {
        switch lang {
        case "es": return "Sin conexión"
        case "ru": return "Офлайн"
        case "sr": return "Ван мреже"
        default: return "Offline"
        }
    }

    nonisolated static func scoresSyncPending(_ lang: String) -> String {
        switch lang {
        case "es": return "Puntuaciones: se enviarán al volver la conexión…"
        case "ru": return "Счёт: отправится при появлении сети…"
        case "sr": return "Резултати: шаљу се када се мрежа врати…"
        default: return "Scores will sync when you’re back online…"
        }
    }

    nonisolated static func resultsRefreshFailed(_ lang: String) -> String {
        switch lang {
        case "es": return "Resultados guardados. Desliza hacia abajo para actualizar."
        case "ru": return "Результаты сохранены. Потяните вниз, чтобы обновить."
        case "sr": return "Резултати сачувани. Повуци надоле за освежавање."
        default: return "Results saved. Pull down to refresh."
        }
    }

    nonisolated static func resultsServerProcessing(_ lang: String) -> String {
        switch lang {
        case "es": return "Procesando resultados en el servidor…"
        case "ru": return "Сервер обрабатывает результаты…"
        case "sr": return "Сервер обрађује резултате…"
        default: return "Server is still processing results…"
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

    nonisolated static func sessionWaitFirstMatch(_ lang: String) -> String {
        switch lang {
        case "es": return "Pulsa Inicio en un partido"
        case "ru": return "Начните матч"
        case "sr": return "Покрени меч"
        default: return "Start a match"
        }
    }

    nonisolated static func sessionFinishGame(_ lang: String) -> String {
        switch lang {
        case "es": return "Finalizar"
        case "ru": return "Завершить игру"
        case "sr": return "Заврши игру"
        default: return "Finish game"
        }
    }

    nonisolated static func sessionExitScoring(_ lang: String) -> String {
        switch lang {
        case "es": return "Salir"
        case "ru": return "Выйти"
        case "sr": return "Изађи"
        default: return "Exit"
        }
    }

    nonisolated static func sessionNeedScoresToFinalize(_ lang: String) -> String {
        switch lang {
        case "es": return "Marca al menos un partido para finalizar."
        case "ru": return "Введите счёт хотя бы в одном матче."
        case "sr": return "Унесите резултат бар у једном мечу."
        default: return "Enter at least one match score to finalize."
        }
    }

    nonisolated static func sessionCannotFinishReadOnly(_ lang: String) -> String {
        switch lang {
        case "es": return "No puedes cerrar este partido aquí."
        case "ru": return "Нельзя завершить этот матч здесь."
        case "sr": return "Не можете завршити овај меч овде."
        default: return "You can’t finish this match here."
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

    nonisolated static func gameEnded(_ lang: String) -> String {
        switch lang {
        case "es": return "Terminado"
        case "ru": return "Завершено"
        case "sr": return "Завршено"
        default: return "Ended"
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

    nonisolated static func score(_ lang: String) -> String {
        switch lang {
        case "es": return "Marcar"
        case "ru": return "Внести счёт"
        case "sr": return "Унеси"
        default: return "Score"
        }
    }

    nonisolated static func edit(_ lang: String) -> String {
        switch lang {
        case "es": return "Editar"
        case "ru": return "Изменить"
        case "sr": return "Измени"
        default: return "Edit"
        }
    }

    nonisolated static func roundSection(_ lang: String, number: Int) -> String {
        switch lang {
        case "es": return "Ronda \(number)"
        case "ru": return "Раунд \(number)"
        case "sr": return "Рунда \(number)"
        default: return "Round \(number)"
        }
    }

    nonisolated static func viewOnlyFinal(_ lang: String) -> String {
        switch lang {
        case "es": return "Los resultados están cerrados. Solo lectura."
        case "ru": return "Итоги зафиксированы. Только просмотр."
        case "sr": return "Резултати су коначни. Само преглед."
        default: return "Results are final. View only."
        }
    }

    nonisolated static func viewOnlyNotOnMatch(_ lang: String) -> String {
        switch lang {
        case "es": return "No estás en este partido."
        case "ru": return "Вы не участвуете в этом матче."
        case "sr": return "Нисте на овом мечу."
        default: return "You're not on this match."
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

    nonisolated static func supplementalGamesBanner(_ lang: String) -> String {
        switch lang {
        case "es": return "Juegos extra"
        case "ru": return "Доп. геймы"
        case "sr": return "Дод. гемови"
        default: return "Extra games"
        }
    }

    nonisolated static func supplementalBallsBanner(_ lang: String) -> String {
        switch lang {
        case "es": return "Pelotas extra"
        case "ru": return "Доп. очки"
        case "sr": return "Дод. поени"
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
        default: return "Add extra games"
        }
    }

    nonisolated static func addExtraBallsRow(_ lang: String) -> String {
        switch lang {
        case "es": return "Añadir pelotas extra"
        case "ru": return "Добавить очки"
        case "sr": return "Додај поене"
        default: return "Add extra balls"
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

    nonisolated static func superTieBreak(_ lang: String) -> String {
        switch lang {
        case "es": return "Super tie-break"
        case "ru": return "Супер тай-брейк"
        case "sr": return "Супер тај-брејк"
        default: return "Super tie-break"
        }
    }

    nonisolated static func setFormatChoiceTitle(_ lang: String) -> String {
        switch lang {
        case "es": return "Tipo de set"
        case "ru": return "Тип сета"
        case "sr": return "Тип сета"
        default: return "Set type"
        }
    }

    nonisolated static func setFormatChoiceMessage(_ lang: String) -> String {
        switch lang {
        case "es": return "Sets empatados. ¿Cómo se juega el decisivo?"
        case "ru": return "Счёт по сетам равный. Как играть решающий сет?"
        case "sr": return "Сетови су изједначени. Како играти одлучујући сет?"
        default: return "Sets are split. How should the deciding set be played?"
        }
    }

    nonisolated static func normalSetChoice(_ lang: String) -> String {
        switch lang {
        case "es": return "Set normal (juegos)"
        case "ru": return "Обычный сет (геймы)"
        case "sr": return "Нормалан сет (гемови)"
        default: return "Normal set (games)"
        }
    }

    nonisolated static func superTieBreakChoice(_ lang: String) -> String {
        switch lang {
        case "es": return "Super tie-break (puntos)"
        case "ru": return "Супер ТБ (очки)"
        case "sr": return "Супер ТБ (поени)"
        default: return "Super tie-break (points)"
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

    nonisolated static func setWord(_ lang: String) -> String {
        switch lang {
        case "es": return "Set"
        case "ru": return "Сет"
        case "sr": return "Сет"
        default: return "Set"
        }
    }

    nonisolated static func moreScoringActions(_ lang: String) -> String {
        switch lang {
        case "es": return "Más"
        case "ru": return "Ещё"
        case "sr": return "Још"
        default: return "More"
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

    /// Golden point at 40–40 (same center label as web `getClassicPointLabels`).
    nonisolated static func goldenPoint(_: String) -> String { "GP" }

    nonisolated static func gameWonConfirmAlertTitle(_ lang: String) -> String {
        switch lang {
        case "es": return "¿Contar juego?"
        case "ru": return "Засчитать гейм?"
        case "sr": return "Уписати гем?"
        default: return "Award game?"
        }
    }

    nonisolated static func gameWonConfirmWonLabel(_ lang: String, playerCount: Int) -> String {
        let plural = playerCount > 1
        switch lang {
        case "es": return plural ? "Ganaron" : "Ganó"
        case "ru": return plural ? "Выиграли" : "Победа"
        case "sr": return plural ? "Победили" : "Победа"
        default: return "Won"
        }
    }

    nonisolated static func gameWonSetScoreWillBe(_ lang: String, teamA: Int, teamB: Int) -> String {
        switch lang {
        case "es": return "El marcador del set será \(teamA):\(teamB)."
        case "ru": return "Счёт в сете будет \(teamA):\(teamB)."
        case "sr": return "Резултат у сету биће \(teamA):\(teamB)."
        default: return "Set score will be \(teamA):\(teamB)."
        }
    }

    nonisolated static func gameWonUnknownSide(_ lang: String) -> String {
        switch lang {
        case "es": return "Este bando"
        case "ru": return "Эта сторона"
        case "sr": return "Ова страна"
        default: return "This side"
        }
    }

    nonisolated static func confirmAction(_ lang: String) -> String {
        switch lang {
        case "es": return "Confirmar"
        case "ru": return "Подтвердить"
        case "sr": return "Потврди"
        default: return "Confirm"
        }
    }

    nonisolated static func cancelAction(_ lang: String) -> String {
        switch lang {
        case "es": return "Cancelar"
        case "ru": return "Отмена"
        case "sr": return "Откажи"
        default: return "Cancel"
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

    nonisolated static func tableTennisScoring(_ lang: String) -> String {
        switch lang {
        case "es": return "Tenis de mesa"
        case "ru": return "Настольный теннис"
        case "sr": return "Stoni tenis"
        default: return "Table tennis"
        }
    }

    nonisolated static func badmintonScoring(_ lang: String) -> String {
        switch lang {
        case "es": return "Bádminton"
        case "ru": return "Бадминтон"
        case "sr": return "Badminton"
        default: return "Badminton"
        }
    }

    nonisolated static func pickleballScoring(_ lang: String) -> String {
        switch lang {
        case "es": return "Pádel pickleball"
        case "ru": return "Пиклбол"
        case "sr": return "Piklbol"
        default: return "Pickleball"
        }
    }

    nonisolated static func squashScoring(_ lang: String) -> String {
        switch lang {
        case "es": return "Squash"
        case "ru": return "Сквош"
        case "sr": return "Skvoš"
        default: return "Squash"
        }
    }

    nonisolated static func pickleballUnderhandServe(_ lang: String) -> String {
        switch lang {
        case "es": return "Saque bajo"
        case "ru": return "Подача снизу"
        case "sr": return "Servis ispod"
        default: return "Underhand serve"
        }
    }

    nonisolated static func pickleballUnderhandServeHint(_ lang: String) -> String {
        switch lang {
        case "es": return "El saque debe ser bajo, contacto bajo la cintura. Diagonal al cuadro contrario. Solo honor — el marcador no cambia."
        case "ru": return "Подача снизу, контакт ниже пояса. По диагонали в квадрат подачи. На доверии — счёт не меняется."
        case "sr": return "Servis ispod ruke, kontakt ispod struka. Dijagonalno u suprotan boks. Na čast — rezultat se ne menja."
        default: return "Serve must be underhand, contact below the waist. Diagonal into the opposite service court. Honor system — score unchanged."
        }
    }

    nonisolated static func pickleballSideOut(_ lang: String) -> String {
        switch lang {
        case "es": return "Side-out"
        case "ru": return "Side-out"
        case "sr": return "Side-out"
        default: return "Side-out"
        }
    }

    nonisolated static func pickleballSideOutHint(_ lang: String) -> String {
        switch lang {
        case "es": return "En side-out solo anota el equipo que saca; tras perder el punto saca el rival. Aquí son puntos rally — toca cualquier equipo."
        case "ru": return "При side-out очко забивает только подающая команда; после проигрыша подаёт соперник. Здесь rally-очки — нажимайте любую команду."
        case "sr": return "Kod side-out poen daje samo servirajući tim. Tabla koristi rally poene — dodirnite bilo koji tim."
        default: return "On side-out only the serving team can score; after losing the rally the other team serves. This board uses rally points — tap either team."
        }
    }

    nonisolated static func pickleballTwoBounce(_ lang: String) -> String {
        switch lang {
        case "es": return "Dos rebotes"
        case "ru": return "Два отскока"
        case "sr": return "Dva odskoka"
        default: return "Two-bounce"
        }
    }

    nonisolated static func pickleballTwoBounceHint(_ lang: String) -> String {
        switch lang {
        case "es": return "La pelota debe botar una vez en cada lado antes del voleo (regla de dos rebotes en la cocina). Solo honor."
        case "ru": return "Мяч должен отскочить по разу на каждой стороне до удара в воздухе (правило двух отскоков). На доверии."
        case "sr": return "Loptica mora jednom odskociti na svakoj strani pre voleja. Samo na čast."
        default: return "The ball must bounce once on each side before a volley (two-bounce rule). Honor system — score unchanged."
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

    nonisolated static func readinessHeading(_ lang: String) -> String {
        switch lang {
        case "es": return "Preparación"
        case "ru": return "Готовность"
        case "sr": return "Спремност"
        default: return "Readiness"
        }
    }

    nonisolated static func readinessParticipantsOk(_ lang: String) -> String {
        switch lang {
        case "es": return "Jugadores: listos"
        case "ru": return "Игроки: готово"
        case "sr": return "Играчи: спремни"
        default: return "Players: ready"
        }
    }

    nonisolated static func readinessParticipantsWaiting(_ lang: String) -> String {
        switch lang {
        case "es": return "Jugadores: faltan"
        case "ru": return "Игроки: ждём"
        case "sr": return "Играчи: чека се"
        default: return "Players: waiting"
        }
    }

    nonisolated static func readinessTeamsOk(_ lang: String) -> String {
        switch lang {
        case "es": return "Equipos: listos"
        case "ru": return "Команды: готово"
        case "sr": return "Тимови: спремни"
        default: return "Teams: ready"
        }
    }

    nonisolated static func readinessTeamsWaiting(_ lang: String) -> String {
        switch lang {
        case "es": return "Equipos: incompletos"
        case "ru": return "Команды: не готовы"
        case "sr": return "Тимови: нису спремни"
        default: return "Teams: not set"
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

    nonisolated static func errorLiveScoringOutOfDate(_ lang: String) -> String {
        switch lang {
        case "es": return "Puntuación actualizada en otro dispositivo."
        case "ru": return "Счёт обновлён на другом устройстве."
        case "sr": return "Резултат је ажуриран на другом уређају."
        default: return "Score was updated on another device."
        }
    }

    nonisolated static func workoutKcal(_ lang: String, value: Int) -> String {
        switch lang {
        case "es": return "\(value) kcal"
        case "ru": return "\(value) ккал"
        case "sr": return "\(value) kcal"
        default: return "\(value) kcal"
        }
    }

    nonisolated static func workoutBpm(_ lang: String, value: Int) -> String {
        switch lang {
        case "es": return "\(value) lpm"
        case "ru": return "\(value) уд/мин"
        case "sr": return "\(value) отк/мин"
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
        default: return "Pause workout"
        }
    }

    nonisolated static func workoutResumeA11y(_ lang: String) -> String {
        switch lang {
        case "es": return "Reanudar entrenamiento"
        case "ru": return "Продолжить тренировку"
        case "sr": return "Настави тренинг"
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
        case "ru": return "Далее"
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
        default: return "Who serves first?"
        }
    }

    nonisolated static func serveFirstBody(_ lang: String) -> String {
        switch lang {
        case "es": return "Te diremos el lado en cada punto. Opcional."
        case "ru": return "Покажем сторону подачи на каждом очке. По желанию."
        default: return "We’ll show serve side each point. Optional."
        }
    }

    nonisolated static func serveRotationRulesLabel(_ lang: String) -> String {
        switch lang {
        case "es": return "Rotación de saque"
        case "ru": return "Ротация подачи"
        case "cs": return "Rotace podání"
        default: return "Serve rotation"
        }
    }

    nonisolated static func serveRotationOfficialTitle(_ lang: String) -> String {
        switch lang {
        case "es": return "Oficial"
        case "ru": return "Официальная"
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
        case "cs": return "Jednoduchá"
        default: return "Simple"
        }
    }

    nonisolated static func serveRotationSimpleDesc(_ lang: String) -> String {
        switch lang {
        case "es": return "Como juego clásico: derecha, izquierda, luego tu compañero."
        case "ru": return "Как в классике: справа, слева, затем партнёр."
        case "cs": return "Jako game: vpravo, vlevo, pak parťák."
        default: return "Like a game: right, left, then your partner."
        }
    }

    nonisolated static func skipServeHints(_ lang: String) -> String {
        switch lang {
        case "es": return "Omitir guía de saque"
        case "ru": return "Без подсказок подачи"
        default: return "Skip serve hints"
        }
    }

    nonisolated static func teamAShort(_ lang: String) -> String {
        switch lang {
        case "es": return "Equipo A"
        case "ru": return "Команда A"
        default: return "Team A"
        }
    }

    nonisolated static func teamBShort(_ lang: String) -> String {
        switch lang {
        case "es": return "Equipo B"
        case "ru": return "Команда B"
        default: return "Team B"
        }
    }

    nonisolated static func courtEndsTitle(_ lang: String) -> String {
        switch lang {
        case "es": return "Ajusta la pista"
        case "ru": return "Совместите с кортом"
        case "cs": return "Srovnejte kurt"
        default: return "Match the court"
        }
    }

    nonisolated static func courtEndsBody(_ lang: String) -> String {
        switch lang {
        case "es": return "Equipo A arriba o abajo según estén ahora."
        case "ru": return "Команда A сверху или снизу — как сейчас на корте."
        case "cs": return "Tým A nahoře nebo dole podle toho, kde stojí."
        default: return "Team A on top or bottom — match where they stand."
        }
    }

    nonisolated static func flipCourtVertical(_ lang: String) -> String {
        switch lang {
        case "es": return "Girar fondos"
        case "ru": return "Поменять концы"
        case "cs": return "Otočit konce"
        default: return "Flip ends"
        }
    }

    nonisolated static func flipTeamASides(_ lang: String) -> String {
        switch lang {
        case "es": return "Eq. A ↔"
        case "ru": return "Команда A ↔"
        case "cs": return "Tým A ↔"
        default: return "Team A ↔"
        }
    }

    nonisolated static func flipTeamBSides(_ lang: String) -> String {
        switch lang {
        case "es": return "Eq. B ↔"
        case "ru": return "Команда B ↔"
        case "cs": return "Tým B ↔"
        default: return "Team B ↔"
        }
    }

    nonisolated static func whoServesFirstGame(_ lang: String) -> String {
        switch lang {
        case "es": return "¿Quién saca este juego?"
        case "ru": return "Кто подаёт в первом гейме?"
        default: return "Who serves this first game?"
        }
    }

    nonisolated static func continueAction(_ lang: String) -> String {
        switch lang {
        case "es": return "Continuar"
        case "ru": return "Далее"
        default: return "Continue"
        }
    }

    nonisolated static func courtRight(_ lang: String) -> String {
        switch lang {
        case "es": return "Derecha"
        case "ru": return "Справа"
        default: return "Right"
        }
    }

    nonisolated static func courtLeft(_ lang: String) -> String {
        switch lang {
        case "es": return "Izquierda"
        case "ru": return "Слева"
        default: return "Left"
        }
    }

    nonisolated static func serveCoachChangeEnds(_ lang: String) -> String {
        switch lang {
        case "es": return "Cambiar de lado"
        case "ru": return "Смена сторон"
        default: return "Change sides"
        }
    }

    nonisolated static func serveCoachHideMatch(_ lang: String) -> String {
        switch lang {
        case "es": return "Ocultar en este partido"
        case "ru": return "Скрыть в этом матче"
        default: return "Hide for this match"
        }
    }

    nonisolated static func serveHintsMenu(_ lang: String) -> String {
        switch lang {
        case "es": return "Guía de saque"
        case "ru": return "Подсказки подачи"
        default: return "Serve hints"
        }
    }

    nonisolated static func serveHintsOn(_ lang: String) -> String {
        switch lang {
        case "es": return "Completa"
        case "ru": return "Полные"
        default: return "Full"
        }
    }

    nonisolated static func serveHintsCompact(_ lang: String) -> String {
        switch lang {
        case "es": return "Compacta"
        case "ru": return "Компактно"
        default: return "Compact"
        }
    }

    nonisolated static func serveHintsOff(_ lang: String) -> String {
        switch lang {
        case "es": return "Apagada"
        case "ru": return "Выкл."
        default: return "Off"
        }
    }

    nonisolated static func fixStartingServer(_ lang: String) -> String {
        switch lang {
        case "es": return "Corregir saque inicial…"
        case "ru": return "Исправить первую подачу…"
        default: return "Fix starting server…"
        }
    }

    nonisolated static func fixStartingServerConfirm(_ lang: String) -> String {
        switch lang {
        case "es": return "Ya hay juegos marcados. ¿Corregir? La guía se recalculará."
        case "ru": return "В сете уже есть геймы. Исправить? Подсказки пересчитаются."
        default: return "Games are already entered. Fix? Serve guide will recalculate."
        }
    }

    nonisolated static func serveCoachToast(_ lang: String) -> String {
        switch lang {
        case "es": return "En cada punto verás el lado de saque."
        case "ru": return "На каждом очке покажем сторону подачи."
        default: return "Each point, we’ll show which side to serve from."
        }
    }

    nonisolated static func serveGuideDisclaimer(_ lang: String) -> String {
        switch lang {
        case "es": return "Orientación; no sustituye reglas del club ni árbitro."
        case "ru": return "Подсказка, не заменяет правила площадки и судью."
        default: return "Assistive guidance, not a substitute for venue rules or an umpire."
        }
    }

    nonisolated static func nextServeA11y(_ lang: String, team: String, name: String, side: String) -> String {
        switch lang {
        case "es": return "Próximo saque: \(team), \(name), \(side)."
        case "ru": return "Следующая подача: \(team), \(name), \(side)."
        default: return "Next serve: \(team), \(name), from the \(side)."
        }
    }

    nonisolated static func serveDetailPerspective(_ lang: String) -> String {
        switch lang {
        case "es": return "Derecha/izquierda mirando hacia la red al sacar."
        case "ru": return "Вправо/влево — как вы смотрите на сетку при подаче."
        default: return "Right/left is as you face the net while serving."
        }
    }

    nonisolated static func serveDetailTbBlock(_ lang: String) -> String {
        switch lang {
        case "es": return "En tie-break, rotación de dos puntos salvo el primero."
        case "ru": return "В тай-брейке — два очка подряд, кроме первого."
        default: return "In a tie-break, two-point rotations except the first point."
        }
    }
}
