package com.funified.bandeja.widgets

object WidgetCopy {
    fun normalizeLang(raw: String?): String {
        val id = raw?.trim()?.lowercase().orEmpty()
        return when {
            id.startsWith("es") -> "es"
            id.startsWith("ru") -> "ru"
            id.startsWith("sr") -> "sr"
            id.startsWith("cs") -> "cs"
            else -> "en"
        }
    }

    fun brand(): String = "Bandeja"

    fun signIn(lang: String): String = when (normalizeLang(lang)) {
        "es" -> "Inicia sesión para ver tu próximo partido"
        "ru" -> "Войдите, чтобы увидеть следующую игру"
        "sr" -> "Пријавите се да видите следећу игру"
        "cs" -> "Přihlaste se a uvidíte další zápas"
        else -> "Sign in to see your next game"
    }

    fun noUpcomingGames(lang: String): String = when (normalizeLang(lang)) {
        "es" -> "No hay partidos próximos"
        "ru" -> "Нет предстоящих игр"
        "sr" -> "Нема предстојећих игара"
        "cs" -> "Žádné nadcházející zápasy"
        else -> "No upcoming games"
    }

    fun nextGameWidgetTitle(lang: String): String = when (normalizeLang(lang)) {
        "es" -> "Próximo partido"
        "ru" -> "Следующая игра"
        "sr" -> "Следећа игра"
        "cs" -> "Další zápas"
        else -> "Next Game"
    }

    fun nextGameWidgetDescription(lang: String): String = when (normalizeLang(lang)) {
        "es" -> "Muestra tu próximo partido en Bandeja."
        "ru" -> "Показывает вашу следующую игру Bandeja."
        "sr" -> "Приказује вашу следећу Bandeja игру."
        "cs" -> "Zobrazí váš další zápas v Bandeja."
        else -> "Shows your next Bandeja game."
    }

    fun now(lang: String): String = when (normalizeLang(lang)) {
        "es" -> "Ahora"
        "ru" -> "Сейчас"
        "sr" -> "Сада"
        "cs" -> "Teď"
        else -> "Now"
    }

    fun ended(lang: String): String = when (normalizeLang(lang)) {
        "es" -> "Terminado"
        "ru" -> "Завершено"
        "sr" -> "Завршено"
        "cs" -> "Skončeno"
        else -> "Ended"
    }

    fun inMinutes(lang: String, count: Int): String = when (normalizeLang(lang)) {
        "es" -> "en ${count} min"
        "ru" -> "через ${count} мин"
        "sr" -> "за ${count} мин"
        "cs" -> "za ${count} min"
        else -> "in ${count} min"
    }

    fun inHours(lang: String, count: Int): String = when (normalizeLang(lang)) {
        "es" -> "en ${count} h"
        "ru" -> "через ${count} ч"
        "sr" -> "за ${count} ч"
        "cs" -> "za ${count} h"
        else -> "in ${count} h"
    }

    fun inDays(lang: String, count: Int): String = when (normalizeLang(lang)) {
        "es" -> "en ${count} d"
        "ru" -> "через ${count} д"
        "sr" -> "за ${count} д"
        "cs" -> "za ${count} d"
        else -> "in ${count} d"
    }
}
