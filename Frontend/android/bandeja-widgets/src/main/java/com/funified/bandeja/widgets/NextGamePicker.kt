package com.funified.bandeja.widgets

object NextGamePicker {
    fun pickNextDisplayable(
        games: List<CachedNextGameDto>,
        referenceEpochMs: Long = System.currentTimeMillis(),
    ): CachedNextGameDto? {
        val cutoffMs = referenceEpochMs - 3_600_000L
        var best: CachedNextGameDto? = null
        var bestStart = Long.MAX_VALUE
        for (game in games) {
            if (game.status == "FINISHED" || game.status == "ARCHIVED") continue
            val startMs = IsoTime.toEpochMillis(game.startTime) ?: continue
            if (startMs <= cutoffMs) continue
            if (startMs < bestStart) {
                best = game
                bestStart = startMs
            }
        }
        return best
    }
}
