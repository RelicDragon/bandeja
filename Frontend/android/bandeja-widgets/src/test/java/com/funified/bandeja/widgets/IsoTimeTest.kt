package com.funified.bandeja.widgets

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class IsoTimeTest {
    @Test
    fun parsesFractionalAndPlainZulu() {
        assertEquals(1_700_000_000_000L, IsoTime.toEpochMillis("2023-11-14T22:13:20.000Z"))
        assertEquals(1_700_000_000_000L, IsoTime.toEpochMillis("2023-11-14T22:13:20Z"))
        assertEquals(1_700_000_000_120L, IsoTime.toEpochMillis("2023-11-14T22:13:20.12Z"))
        assertEquals(1_700_000_000_123L, IsoTime.toEpochMillis("2023-11-14T22:13:20.123456Z"))
    }

    @Test
    fun parsesOffsets() {
        assertEquals(1_700_000_000_000L, IsoTime.toEpochMillis("2023-11-14T22:13:20+00:00"))
        assertEquals(1_700_000_000_000L, IsoTime.toEpochMillis("2023-11-14T23:13:20+01:00"))
    }

    @Test
    fun rejectsGarbage() {
        assertNull(IsoTime.toEpochMillis("not-a-date"))
        assertNull(IsoTime.toEpochMillis(""))
    }
}
