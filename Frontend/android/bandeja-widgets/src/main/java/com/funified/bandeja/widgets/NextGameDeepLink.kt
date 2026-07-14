package com.funified.bandeja.widgets

import android.net.Uri
import java.net.URI

/**
 * Cache-first rewrite for Assistant / static shortcut `/next-game` launches (#276).
 * When the synced envelope has a displayable next game, open that game URL directly
 * (detail / chat / live) so Cap does not need a redundant my-games fetch.
 */
object NextGameDeepLink {
    @JvmStatic
    @JvmOverloads
    fun rewriteUrl(
        url: String,
        envelope: NextGamesEnvelope?,
        referenceEpochMs: Long = System.currentTimeMillis(),
    ): String {
        val parsed = runCatching { URI(url) }.getOrNull() ?: return url
        val host = parsed.host ?: return url
        if (host != "bandeja.me" && host != "www.bandeja.me") return url

        val path = parsed.path.trimEnd('/').ifEmpty { "/" }
        if (path != "/next-game") return url

        if (envelope == null || !envelope.isAuthenticated) return url
        val next = NextGamePicker.pickNextDisplayable(envelope.games, referenceEpochMs) ?: return url

        val open = queryParam(parsed.rawQuery, "open")
        return when (open) {
            "chat" -> WidgetDeepLinks.gameChat(next.id)
            "live" -> WidgetDeepLinks.gameLive(next.id)
            else -> WidgetDeepLinks.game(next.id)
        }
    }

    @JvmStatic
    @JvmOverloads
    fun rewrite(
        uri: Uri,
        envelope: NextGamesEnvelope?,
        referenceEpochMs: Long = System.currentTimeMillis(),
    ): Uri {
        val rewritten = rewriteUrl(uri.toString(), envelope, referenceEpochMs)
        return if (rewritten == uri.toString()) uri else Uri.parse(rewritten)
    }

    private fun queryParam(rawQuery: String?, key: String): String? {
        if (rawQuery.isNullOrBlank()) return null
        for (part in rawQuery.split('&')) {
            val eq = part.indexOf('=')
            val name = if (eq < 0) part else part.substring(0, eq)
            if (name == key) {
                return if (eq < 0) "" else part.substring(eq + 1)
            }
        }
        return null
    }
}
