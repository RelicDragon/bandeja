package com.funified.bandeja.widgets

import java.util.concurrent.TimeUnit

internal data class NextGameUiState(
    val eyebrow: String,
    val headline: String,
    val timeLine: String?,
    val detail: String?,
    val deepLink: String,
    val hasGame: Boolean,
)

internal object NextGameUiMapper {
    fun fromEnvelope(
        envelope: NextGamesEnvelope?,
        referenceEpochMs: Long = System.currentTimeMillis(),
    ): NextGameUiState {
        val lang = WidgetCopy.normalizeLang(envelope?.language)
        if (envelope == null || !envelope.isAuthenticated) {
            return NextGameUiState(
                eyebrow = WidgetCopy.brand(),
                headline = WidgetCopy.signIn(lang),
                timeLine = null,
                detail = null,
                deepLink = WidgetDeepLinks.LOGIN,
                hasGame = false,
            )
        }
        val game = NextGamePicker.pickNextDisplayable(envelope.games, referenceEpochMs)
        if (game == null) {
            return NextGameUiState(
                eyebrow = WidgetCopy.nextGameWidgetTitle(lang),
                headline = WidgetCopy.noUpcomingGames(lang),
                timeLine = null,
                detail = null,
                deepLink = WidgetDeepLinks.HOME,
                hasGame = false,
            )
        }
        return NextGameUiState(
            eyebrow = WidgetCopy.nextGameWidgetTitle(lang),
            headline = game.title,
            timeLine = relativeTime(game.startTime, lang, referenceEpochMs),
            detail = game.clubName?.takeIf { it.isNotBlank() },
            deepLink = WidgetDeepLinks.game(game.id),
            hasGame = true,
        )
    }

    private fun relativeTime(
        startTimeIso: String,
        lang: String,
        referenceEpochMs: Long,
    ): String {
        val startMs = IsoTime.toEpochMillis(startTimeIso) ?: return startTimeIso
        val delta = startMs - referenceEpochMs
        if (delta < 0 && delta > -3_600_000L) return WidgetCopy.now(lang)
        if (delta < 0) return WidgetCopy.ended(lang)
        val minutes = TimeUnit.MILLISECONDS.toMinutes(delta).coerceAtLeast(1)
        if (minutes < 60) return WidgetCopy.inMinutes(lang, minutes.toInt())
        val hours = TimeUnit.MILLISECONDS.toHours(delta).coerceAtLeast(1)
        if (hours < 48) return WidgetCopy.inHours(lang, hours.toInt())
        val days = TimeUnit.MILLISECONDS.toDays(delta).coerceAtLeast(1)
        return WidgetCopy.inDays(lang, days.toInt())
    }
}
