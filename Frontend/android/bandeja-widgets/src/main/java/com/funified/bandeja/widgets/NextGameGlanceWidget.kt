package com.funified.bandeja.widgets

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.color.ColorProvider
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle

class NextGameGlanceWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(
        setOf(SMALL, MEDIUM),
    )

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val state = runCatching {
            NextGameUiMapper.fromEnvelope(NextGamesEnvelopeStorage.read(context))
        }.getOrElse {
            NextGameUiMapper.fromEnvelope(null)
        }
        provideContent {
            GlanceTheme {
                NextGameWidgetContent(state = state)
            }
        }
    }

    companion object {
        val SMALL = DpSize(110.dp, 110.dp)
        val MEDIUM = DpSize(250.dp, 110.dp)
    }
}

@Composable
private fun NextGameWidgetContent(state: NextGameUiState) {
    val size = LocalSize.current
    val isMedium = size.width >= NextGameGlanceWidget.MEDIUM.width
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(state.deepLink)).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        setPackage("com.funified.bandeja")
    }
    val accent = ColorProvider(day = Color(0xFF1EB884), night = Color(0xFF3FDB9C))
    val onSurface = ColorProvider(day = Color(0xFF12211C), night = Color(0xFFF2FBF7))
    val muted = ColorProvider(day = Color(0xFF5B6F68), night = Color(0xFFA9C2B8))
    val surface = ColorProvider(day = Color(0xFFF3FAF7), night = Color(0xFF14201C))

    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .cornerRadius(20.dp)
            .background(surface)
            .padding(if (isMedium) 16.dp else 12.dp)
            .clickable(actionStartActivity(intent)),
        verticalAlignment = Alignment.Top,
        horizontalAlignment = Alignment.Start,
    ) {
        Text(
            text = state.eyebrow,
            style = TextStyle(
                color = accent,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
            ),
            maxLines = 1,
        )
        Spacer(modifier = GlanceModifier.height(6.dp))
        Text(
            text = state.headline,
            style = TextStyle(
                color = onSurface,
                fontSize = if (isMedium) 18.sp else 15.sp,
                fontWeight = FontWeight.Bold,
            ),
            maxLines = if (isMedium) 2 else 4,
        )
        if (state.hasGame && !state.timeLine.isNullOrBlank()) {
            Spacer(modifier = GlanceModifier.height(6.dp))
            Text(
                text = state.timeLine,
                style = TextStyle(
                    color = muted,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                ),
                maxLines = 1,
            )
        }
        if (isMedium && state.hasGame && !state.detail.isNullOrBlank()) {
            Spacer(modifier = GlanceModifier.height(4.dp))
            Text(
                text = state.detail,
                style = TextStyle(
                    color = muted,
                    fontSize = 12.sp,
                ),
                maxLines = 1,
            )
        }
        Spacer(modifier = GlanceModifier.defaultWeight())
        if (isMedium) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = WidgetCopy.brand(),
                    style = TextStyle(color = accent, fontSize = 11.sp, fontWeight = FontWeight.Medium),
                )
                Spacer(modifier = GlanceModifier.width(6.dp))
                Text(
                    text = "→",
                    style = TextStyle(color = accent, fontSize = 12.sp),
                )
            }
        }
    }
}

class NextGameWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = NextGameGlanceWidget()
}
