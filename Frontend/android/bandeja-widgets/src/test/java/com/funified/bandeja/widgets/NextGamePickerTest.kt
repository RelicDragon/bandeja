package com.funified.bandeja.widgets

import org.json.JSONObject
import org.json.JSONTokener
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.InputStreamReader
import java.nio.charset.StandardCharsets

/**
 * Loads `Frontend/shared/nextGame/pickNextGameGolden.json` via test resources
 * (Gradle wires shared/nextGame onto the test classpath).
 */
object PickNextGameGoldenFixtures {
    const val EXPECTED_POLICY =
        "Soonest non-FINISHED/ARCHIVED game with startTime strictly after reference−1h; earliest startTime wins."

    val REQUIRED_CASES: Set<String> = setOf(
        "empty-list",
        "one-upcoming",
        "in-now-minus-1h-window",
        "finished-archived-excluded",
        "tie-break-by-startTime",
    )

    data class FixtureGame(
        val id: String,
        val startTime: String,
        val status: String,
    )

    data class Case(
        val name: String,
        val reference: String,
        val games: List<FixtureGame>,
        val expectedId: String?,
    )

    data class Catalog(
        val policy: String,
        val minCases: Int,
        val cases: List<Case>,
    )

    fun loadCatalog(): Catalog {
        val loader =
            PickNextGameGoldenFixtures::class.java.classLoader
                ?: error("missing class loader")
        val stream =
            loader.getResourceAsStream("pickNextGameGolden.json")
                ?: error("pickNextGameGolden.json missing from test classpath")
        val text = InputStreamReader(stream, StandardCharsets.UTF_8).use { it.readText() }
        val root = JSONTokener(text).nextValue() as JSONObject
        val casesJson = root.getJSONArray("cases")
        val cases = buildList {
            for (i in 0 until casesJson.length()) {
                val c = casesJson.getJSONObject(i)
                val gamesJson = c.getJSONArray("games")
                val games = buildList {
                    for (j in 0 until gamesJson.length()) {
                        val g = gamesJson.getJSONObject(j)
                        add(
                            FixtureGame(
                                id = g.getString("id"),
                                startTime = g.getString("startTime"),
                                status = g.getString("status"),
                            ),
                        )
                    }
                }
                val expectedId =
                    if (c.isNull("expectedId")) null else c.getString("expectedId")
                add(
                    Case(
                        name = c.getString("name"),
                        reference = c.getString("reference"),
                        games = games,
                        expectedId = expectedId,
                    ),
                )
            }
        }
        return Catalog(
            policy = root.getString("policy"),
            minCases = root.getInt("minCases"),
            cases = cases,
        )
    }

    fun toDto(game: FixtureGame): CachedNextGameDto =
        CachedNextGameDto(
            id = game.id,
            title = game.id,
            clubName = null,
            startTime = game.startTime,
            status = game.status,
            resultsStatus = "NONE",
            gameType = "MATCH",
            participantCount = 2,
            maxParticipants = 4,
            sport = "PADEL",
            playersPerMatch = 4,
        )
}

class NextGamePickerTest {
    @Test
    fun policyStringMatchesCanonical() {
        val catalog = PickNextGameGoldenFixtures.loadCatalog()
        assertEquals(PickNextGameGoldenFixtures.EXPECTED_POLICY, catalog.policy)
        assertEquals(PickNextGameGoldenFixtures.EXPECTED_POLICY, NextGamePicker.DISPLAY_POLICY)
    }

    @Test
    fun catalogMeetsMinimumCaseCount() {
        val catalog = PickNextGameGoldenFixtures.loadCatalog()
        assertTrue(catalog.cases.size >= catalog.minCases)
        assertTrue(catalog.minCases >= 5)
        val names = catalog.cases.map { it.name }.toSet()
        assertTrue(
            "missing ${PickNextGameGoldenFixtures.REQUIRED_CASES - names}",
            names.containsAll(PickNextGameGoldenFixtures.REQUIRED_CASES),
        )
    }

    @Test
    fun goldenCasesMatchPicker() {
        val catalog = PickNextGameGoldenFixtures.loadCatalog()
        for (fixture in catalog.cases) {
            val referenceMs = IsoTime.toEpochMillis(fixture.reference)
            assertNotNull("reference ${fixture.reference}", referenceMs)
            val games = fixture.games.map(PickNextGameGoldenFixtures::toDto)
            val next = NextGamePicker.pickNextDisplayable(games, checkNotNull(referenceMs))
            assertEquals(
                "golden case ${fixture.name}",
                fixture.expectedId,
                next?.id,
            )
            assertEquals(
                "listDisplayable head matches pick for ${fixture.name}",
                next?.id,
                NextGamePicker.listDisplayable(games, referenceMs).firstOrNull()?.id,
            )
        }
    }
}
