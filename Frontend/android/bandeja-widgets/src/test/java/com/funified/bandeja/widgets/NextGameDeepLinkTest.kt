package com.funified.bandeja.widgets

import org.junit.Assert.assertEquals
import org.junit.Test

class NextGameDeepLinkTest {
    private val referenceMs = IsoTime.toEpochMillis("2026-07-14T12:00:00.000Z")!!

    private fun game(
        id: String,
        startTime: String = "2026-07-14T16:00:00.000Z",
        status: String = "ANNOUNCED",
    ) = CachedNextGameDto(
        id = id,
        title = "Match $id",
        clubName = "Club",
        startTime = startTime,
        status = status,
        resultsStatus = "NONE",
        gameType = "MATCH",
        participantCount = 2,
        maxParticipants = 4,
        sport = "PADEL",
        playersPerMatch = 4,
    )

    @Test
    fun rewrite_opensGameDetail_whenEnvelopeHasDisplayableNext() {
        val envelope = NextGamesEnvelope(
            isAuthenticated = true,
            language = "en",
            games = listOf(game("g1")),
        )
        assertEquals(
            WidgetDeepLinks.game("g1"),
            NextGameDeepLink.rewriteUrl(
                WidgetDeepLinks.NEXT_GAME,
                envelope,
                referenceMs,
            ),
        )
    }

    @Test
    fun rewrite_opensChatAndLive_fromOpenQuery() {
        val envelope = NextGamesEnvelope(
            isAuthenticated = true,
            language = "en",
            games = listOf(game("g1")),
        )
        assertEquals(
            WidgetDeepLinks.gameChat("g1"),
            NextGameDeepLink.rewriteUrl(
                WidgetDeepLinks.NEXT_GAME_CHAT,
                envelope,
                referenceMs,
            ),
        )
        assertEquals(
            WidgetDeepLinks.gameLive("g1"),
            NextGameDeepLink.rewriteUrl(
                WidgetDeepLinks.NEXT_GAME_LIVE,
                envelope,
                referenceMs,
            ),
        )
    }

    @Test
    fun rewrite_keepsNextGame_whenUnauthenticatedOrEmpty() {
        assertEquals(
            WidgetDeepLinks.NEXT_GAME,
            NextGameDeepLink.rewriteUrl(
                WidgetDeepLinks.NEXT_GAME,
                NextGamesEnvelope.unauthenticated(),
                referenceMs,
            ),
        )
        assertEquals(
            WidgetDeepLinks.NEXT_GAME_CHAT,
            NextGameDeepLink.rewriteUrl(
                WidgetDeepLinks.NEXT_GAME_CHAT,
                NextGamesEnvelope(isAuthenticated = true, language = "en", games = emptyList()),
                referenceMs,
            ),
        )
        assertEquals(
            WidgetDeepLinks.NEXT_GAME,
            NextGameDeepLink.rewriteUrl(
                WidgetDeepLinks.NEXT_GAME,
                null,
                referenceMs,
            ),
        )
    }

    @Test
    fun rewrite_ignoresNonNextGameUrls() {
        val envelope = NextGamesEnvelope(
            isAuthenticated = true,
            language = "en",
            games = listOf(game("g1")),
        )
        assertEquals(
            "https://bandeja.me/find",
            NextGameDeepLink.rewriteUrl("https://bandeja.me/find", envelope, referenceMs),
        )
        assertEquals(
            WidgetDeepLinks.game("other"),
            NextGameDeepLink.rewriteUrl(WidgetDeepLinks.game("other"), envelope, referenceMs),
        )
    }

    @Test
    fun rewrite_usesLockedPickerPolicy() {
        val envelope = NextGamesEnvelope(
            isAuthenticated = true,
            language = "en",
            games = listOf(
                game("finished", status = "FINISHED"),
                game("later", startTime = "2026-07-14T18:00:00.000Z"),
                game("sooner", startTime = "2026-07-14T15:00:00.000Z"),
            ),
        )
        assertEquals(
            WidgetDeepLinks.game("sooner"),
            NextGameDeepLink.rewriteUrl(WidgetDeepLinks.NEXT_GAME, envelope, referenceMs),
        )
    }
}
