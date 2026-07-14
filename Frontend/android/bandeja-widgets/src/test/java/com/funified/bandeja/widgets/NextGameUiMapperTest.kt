package com.funified.bandeja.widgets

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NextGameUiMapperTest {
    @Test
    fun signedOutIgnoresCachedGames() {
        val state = NextGameUiMapper.fromEnvelope(
            NextGamesEnvelope(
                isAuthenticated = false,
                language = "es",
                games = listOf(
                    CachedNextGameDto(
                        id = "g1",
                        title = "Should hide",
                        clubName = "Club",
                        startTime = "2099-01-01T10:00:00.000Z",
                        status = "SCHEDULED",
                        resultsStatus = "NONE",
                        gameType = "MATCH",
                        participantCount = 2,
                        maxParticipants = 4,
                        sport = "PADEL",
                        playersPerMatch = 4,
                    ),
                ),
            ),
            referenceEpochMs = 1_700_000_000_000L,
        )
        assertFalse(state.hasGame)
        assertEquals(WidgetDeepLinks.LOGIN, state.deepLink)
        assertEquals(WidgetCopy.signIn("es"), state.headline)
    }

    @Test
    fun authenticatedEmptyUsesHomeDeepLink() {
        val state = NextGameUiMapper.fromEnvelope(
            NextGamesEnvelope(isAuthenticated = true, language = "en", games = emptyList()),
            referenceEpochMs = 1_700_000_000_000L,
        )
        assertFalse(state.hasGame)
        assertEquals(WidgetDeepLinks.HOME, state.deepLink)
    }

    @Test
    fun authenticatedNextGameUsesGameDeepLinkAndClub() {
        val state = NextGameUiMapper.fromEnvelope(
            NextGamesEnvelope(
                isAuthenticated = true,
                language = "en",
                games = listOf(
                    CachedNextGameDto(
                        id = "g1",
                        title = "Morning",
                        clubName = "Club A",
                        startTime = "2023-11-14T23:13:20.000Z",
                        status = "READY",
                        resultsStatus = "NONE",
                        gameType = "MATCH",
                        participantCount = 2,
                        maxParticipants = 4,
                        sport = "PADEL",
                        playersPerMatch = 4,
                    ),
                ),
            ),
            referenceEpochMs = 1_700_000_000_000L,
        )
        assertTrue(state.hasGame)
        assertEquals("Morning", state.headline)
        assertEquals("Club A", state.detail)
        assertEquals(WidgetDeepLinks.game("g1"), state.deepLink)
    }
}
