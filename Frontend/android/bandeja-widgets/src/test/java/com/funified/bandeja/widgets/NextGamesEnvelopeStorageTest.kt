package com.funified.bandeja.widgets

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.json.JSONObject

class NextGamesEnvelopeStorageTest {
    @Test
    fun encodeDecodeRoundTrip() {
        val envelope = NextGamesEnvelope(
            isAuthenticated = true,
            language = "ru",
            games = listOf(
                CachedNextGameDto(
                    id = "g1",
                    title = "Morning",
                    clubName = "Club",
                    startTime = "2026-07-14T10:00:00.000Z",
                    status = "SCHEDULED",
                    resultsStatus = "NONE",
                    gameType = "MATCH",
                    participantCount = 2,
                    maxParticipants = 4,
                    sport = "PADEL",
                    playersPerMatch = 4,
                ),
            ),
        )
        val encoded = NextGamesEnvelopeStorage.encode(envelope)
        val decoded = NextGamesEnvelopeStorage.decode(encoded)
        assertTrue(decoded.isAuthenticated)
        assertEquals("ru", decoded.language)
        assertEquals(1, decoded.games.size)
        assertEquals("g1", decoded.games[0].id)
        assertEquals("Club", decoded.games[0].clubName)
    }

    @Test
    fun decodeSkipsCorruptGameRows() {
        val raw = JSONObject(
            """
            {
              "isAuthenticated": true,
              "language": "en",
              "games": [
                {"id":"bad","title":"X","startTime":"nope","status":"READY","resultsStatus":"NONE","gameType":"MATCH","participantCount":0},
                {
                  "id": "g1",
                  "title": "Match",
                  "clubName": null,
                  "startTime": "2026-07-14T10:00:00.000Z",
                  "status": "READY",
                  "resultsStatus": "NONE",
                  "gameType": "MATCH",
                  "participantCount": 0,
                  "maxParticipants": null,
                  "sport": null,
                  "playersPerMatch": null
                }
              ]
            }
            """.trimIndent(),
        )
        val decoded = NextGamesEnvelopeStorage.decode(raw)
        assertEquals(1, decoded.games.size)
        assertEquals("g1", decoded.games[0].id)
    }

    @Test
    fun decodeNullOptionalFields() {
        val raw = JSONObject(
            """
            {
              "isAuthenticated": true,
              "language": "en",
              "games": [{
                "id": "g1",
                "title": "Match",
                "clubName": null,
                "startTime": "2026-07-14T10:00:00.000Z",
                "status": "READY",
                "resultsStatus": "NONE",
                "gameType": "MATCH",
                "participantCount": 0,
                "maxParticipants": null,
                "sport": null,
                "playersPerMatch": null
              }]
            }
            """.trimIndent(),
        )
        val decoded = NextGamesEnvelopeStorage.decode(raw)
        assertNull(decoded.games[0].clubName)
        assertNull(decoded.games[0].maxParticipants)
    }
}
