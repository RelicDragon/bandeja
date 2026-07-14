package com.funified.bandeja.widgets

import androidx.compose.ui.graphics.Color
import androidx.glance.color.ColorProvider

/** Bandeja brand tokens — sky primary + icon wash (matches web / splash). */
object BandejaWidgetBrand {
    val accent = ColorProvider(day = Color(0xFF0EA5E9), night = Color(0xFF38BDF8))
    val onSurface = ColorProvider(day = Color(0xFF082F49), night = Color(0xFFF0F9FF))
    val muted = ColorProvider(day = Color(0xFF0369A1), night = Color(0xFF7DD3FC))
    val surface = ColorProvider(day = Color(0xFFE8F6F8), night = Color(0xFF0C4A6E))
}
