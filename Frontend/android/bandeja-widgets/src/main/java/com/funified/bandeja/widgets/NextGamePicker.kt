package com.funified.bandeja.widgets

/**
 * Canonical policy (keep in sync with `NEXT_GAME_DISPLAY_POLICY` / golden JSON — #273):
 * Soonest non-FINISHED/ARCHIVED game with startTime strictly after reference−1h; earliest startTime wins.
 */
object NextGamePicker {
    const val DISPLAY_POLICY =
        "Soonest non-FINISHED/ARCHIVED game with startTime strictly after reference−1h; earliest startTime wins."

    private const val LOOKBACK_MS = 3_600_000L

    /**
     * Displayable upcoming games sorted by soonest startTime (same filter as [pickNextDisplayable]).
     * Used by dynamic launcher shortcuts for the top-N list.
     */
    @JvmStatic
    @JvmOverloads
    fun listDisplayable(
        games: List<CachedNextGameDto>,
        referenceEpochMs: Long = System.currentTimeMillis(),
    ): List<CachedNextGameDto> {
        val cutoffMs = referenceEpochMs - LOOKBACK_MS
        return games
            .mapNotNull { game ->
                val startMs = eligibleStartMs(game, cutoffMs) ?: return@mapNotNull null
                game to startMs
            }
            .sortedBy { it.second }
            .map { it.first }
    }

    /** Matches JS `pickNextGame` / Swift `NextGamePicker.pickNextDisplayable`. O(n). */
    @JvmStatic
    @JvmOverloads
    fun pickNextDisplayable(
        games: List<CachedNextGameDto>,
        referenceEpochMs: Long = System.currentTimeMillis(),
    ): CachedNextGameDto? {
        val cutoffMs = referenceEpochMs - LOOKBACK_MS
        var best: CachedNextGameDto? = null
        var bestStart = Long.MAX_VALUE
        for (game in games) {
            val startMs = eligibleStartMs(game, cutoffMs) ?: continue
            if (startMs < bestStart) {
                best = game
                bestStart = startMs
            }
        }
        return best
    }

    private fun eligibleStartMs(game: CachedNextGameDto, cutoffMs: Long): Long? {
        if (game.status == "FINISHED" || game.status == "ARCHIVED") return null
        val startMs = IsoTime.toEpochMillis(game.startTime) ?: return null
        if (startMs <= cutoffMs) return null
        return startMs
    }
}
