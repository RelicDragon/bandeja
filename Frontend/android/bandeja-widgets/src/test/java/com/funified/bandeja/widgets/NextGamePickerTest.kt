package com.funified.bandeja.widgets

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NextGamePickerTest {
    @Test
    fun picksSoonestEligibleGame() {
        val now = 1_700_000_000_000L
        val games = listOf(
            game("finished", "2023-11-14T22:16:40.000Z", "FINISHED"),
            game("old", "2023-11-14T21:00:00.000Z", "SCHEDULED"),
            game("later", "2023-11-15T00:13:20.000Z", "ANNOUNCED"),
            game("soon", "2023-11-14T23:13:20.000Z", "READY"),
        )
        val next = NextGamePicker.pickNextDisplayable(games, now)
        assertEquals("soon", next?.id)
    }

    @Test
    fun returnsNullWhenNoneEligible() {
        val now = 1_700_000_000_000L
        assertNull(
            NextGamePicker.pickNextDisplayable(
                listOf(game("archived", "2023-11-15T00:00:00.000Z", "ARCHIVED")),
                now,
            ),
        )
    }

    private fun game(id: String, startTime: String, status: String) = CachedNextGameDto(
        id = id,
        title = id,
        clubName = null,
        startTime = startTime,
        status = status,
        resultsStatus = "NONE",
        gameType = "MATCH",
        participantCount = 2,
        maxParticipants = 4,
        sport = "PADEL",
        playersPerMatch = 4,
    )
}
