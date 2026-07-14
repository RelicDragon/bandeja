package com.funified.bandeja.widgets

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

object NextGamesEnvelopeStorage {
    private const val PREFS = "bandeja_widget_next_games"
    private const val KEY_ENVELOPE = "envelope.v1"
    private const val KEY_LANGUAGE = "language.v1"

    @JvmStatic
    fun write(context: Context, envelope: NextGamesEnvelope): Boolean {
        return prefs(context).edit()
            .putString(KEY_ENVELOPE, encode(envelope).toString())
            .putString(KEY_LANGUAGE, envelope.language)
            .commit()
    }

    @JvmStatic
    fun writeFromJson(context: Context, envelopeJson: String): Boolean {
        return runCatching {
            write(context, decode(JSONObject(envelopeJson)))
        }.getOrDefault(false)
    }

    @JvmStatic
    fun clear(context: Context): Boolean {
        val language = prefs(context).getString(KEY_LANGUAGE, "en") ?: "en"
        return write(context, NextGamesEnvelope.unauthenticated(language))
    }

    @JvmStatic
    fun read(context: Context): NextGamesEnvelope? {
        val raw = prefs(context).getString(KEY_ENVELOPE, null) ?: return null
        return runCatching { decode(JSONObject(raw)) }.getOrNull()
    }

    @JvmStatic
    fun encode(envelope: NextGamesEnvelope): JSONObject {
        val games = JSONArray()
        for (game in envelope.games) {
            games.put(
                JSONObject()
                    .put("id", game.id)
                    .put("title", game.title)
                    .put("clubName", game.clubName ?: JSONObject.NULL)
                    .put("startTime", game.startTime)
                    .put("status", game.status)
                    .put("resultsStatus", game.resultsStatus)
                    .put("gameType", game.gameType)
                    .put("participantCount", game.participantCount)
                    .put("maxParticipants", game.maxParticipants ?: JSONObject.NULL)
                    .put("sport", game.sport ?: JSONObject.NULL)
                    .put("playersPerMatch", game.playersPerMatch ?: JSONObject.NULL),
            )
        }
        return JSONObject()
            .put("isAuthenticated", envelope.isAuthenticated)
            .put("language", envelope.language)
            .put("games", games)
    }

    @JvmStatic
    fun decode(json: JSONObject): NextGamesEnvelope {
        val gamesJson = json.optJSONArray("games") ?: JSONArray()
        val games = ArrayList<CachedNextGameDto>(gamesJson.length())
        for (i in 0 until gamesJson.length()) {
            val item = gamesJson.optJSONObject(i) ?: continue
            val id = item.optString("id", "").trim()
            val title = item.optString("title", "").trim()
            val startTime = item.optString("startTime", "").trim()
            val status = item.optString("status", "").trim()
            if (id.isEmpty() || title.isEmpty() || startTime.isEmpty() || status.isEmpty()) continue
            if (IsoTime.toEpochMillis(startTime) == null) continue
            games.add(
                CachedNextGameDto(
                    id = id,
                    title = title,
                    clubName = item.optNullableString("clubName"),
                    startTime = startTime,
                    status = status,
                    resultsStatus = item.optString("resultsStatus", "NONE").ifBlank { "NONE" },
                    gameType = item.optString("gameType", "MATCH").ifBlank { "MATCH" },
                    participantCount = item.optInt("participantCount", 0),
                    maxParticipants = item.optNullableInt("maxParticipants"),
                    sport = item.optNullableString("sport"),
                    playersPerMatch = item.optNullableInt("playersPerMatch"),
                ),
            )
        }
        return NextGamesEnvelope(
            isAuthenticated = json.optBoolean("isAuthenticated", false),
            language = json.optString("language", "en").ifBlank { "en" },
            games = games,
        )
    }

    private fun prefs(context: Context): SharedPreferences {
        return context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    }

    private fun JSONObject.optNullableString(key: String): String? {
        if (!has(key) || isNull(key)) return null
        val value = optString(key, "")
        return value.ifBlank { null }
    }

    private fun JSONObject.optNullableInt(key: String): Int? {
        if (!has(key) || isNull(key)) return null
        return optInt(key)
    }
}
