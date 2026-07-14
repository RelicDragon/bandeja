package com.funified.bandeja.widgets

import java.text.ParseException
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import java.util.regex.Pattern

/**
 * Fast, thread-safe ISO-8601 parse for widget cache.
 * Normalizes variable fractional seconds so API timestamps always decode.
 */
internal object IsoTime {
    private val lock = Any()
    private val utc: TimeZone = TimeZone.getTimeZone("UTC")
    private val fractional = Pattern.compile(
        "^(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2})(\\.\\d+)?(Z|[+-]\\d{2}:?\\d{2})$",
    )

    private val withMillisZ: SimpleDateFormat = formatter("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
    private val plainZ: SimpleDateFormat = formatter("yyyy-MM-dd'T'HH:mm:ss'Z'")
    private val withMillisOffset: SimpleDateFormat = formatter("yyyy-MM-dd'T'HH:mm:ss.SSSX")
    private val plainOffset: SimpleDateFormat = formatter("yyyy-MM-dd'T'HH:mm:ssX")

    fun toEpochMillis(iso: String): Long? {
        val normalized = normalize(iso) ?: return null
        synchronized(lock) {
            for (formatter in formattersFor(normalized)) {
                try {
                    return formatter.parse(normalized)?.time
                } catch (_: ParseException) {
                    // try next
                }
            }
        }
        return null
    }

    private fun normalize(raw: String): String? {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return null
        val matcher = fractional.matcher(trimmed)
        if (!matcher.matches()) return trimmed
        val head = matcher.group(1) ?: return trimmed
        val frac = matcher.group(2)
        val zone = matcher.group(3) ?: "Z"
        val millis = when {
            frac.isNullOrEmpty() -> ""
            else -> {
                val digits = frac.substring(1)
                val padded = (digits + "000").take(3)
                ".$padded"
            }
        }
        val zoneNorm = if (zone == "Z") "Z" else zone
        return head + millis + zoneNorm
    }

    private fun formattersFor(value: String): List<SimpleDateFormat> {
        val hasMillis = value.length > 19 && value[19] == '.'
        val hasZ = value.endsWith("Z")
        return when {
            hasMillis && hasZ -> listOf(withMillisZ, plainZ, withMillisOffset, plainOffset)
            hasMillis -> listOf(withMillisOffset, plainOffset, withMillisZ, plainZ)
            hasZ -> listOf(plainZ, withMillisZ, plainOffset, withMillisOffset)
            else -> listOf(plainOffset, withMillisOffset, plainZ, withMillisZ)
        }
    }

    private fun formatter(pattern: String): SimpleDateFormat {
        return SimpleDateFormat(pattern, Locale.US).apply {
            timeZone = utc
            isLenient = false
        }
    }
}
