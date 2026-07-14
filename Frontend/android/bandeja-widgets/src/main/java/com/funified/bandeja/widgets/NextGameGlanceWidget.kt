package com.funified.bandeja.widgets

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
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
private fun BrandMark(size: Dp) {
    Image(
        provider = ImageProvider(R.drawable.ic_bandeja_logo),
        contentDescription = WidgetCopy.brand(),
        modifier = GlanceModifier.size(size).cornerRadius((size.value * 0.22f).dp),
        contentScale = ContentScale.Fit,
    )
}

@Composable
private fun NextGameWidgetContent(state: NextGameUiState) {
    val size = LocalSize.current
    val isMedium = size.width >= NextGameGlanceWidget.MEDIUM.width
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(state.deepLink)).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        setPackage("com.funified.bandeja")
    }
    val accent = BandejaWidgetBrand.accent
    val onSurface = BandejaWidgetBrand.onSurface
    val muted = BandejaWidgetBrand.muted
    val surface = BandejaWidgetBrand.surface

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
        if (!state.hasGame) {
            BrandMark(if (isMedium) 44.dp else 32.dp)
            Spacer(modifier = GlanceModifier.height(10.dp))
            if (isMedium) {
                Text(
                    text = WidgetCopy.brand(),
                    style = TextStyle(
                        color = onSurface,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                    ),
                    maxLines = 1,
                )
                Spacer(modifier = GlanceModifier.height(4.dp))
            }
            Text(
                text = state.headline,
                style = TextStyle(
                    color = muted,
                    fontSize = if (isMedium) 14.sp else 13.sp,
                    fontWeight = FontWeight.Medium,
                ),
                maxLines = if (isMedium) 3 else 4,
            )
        } else {
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
                maxLines = if (isMedium) 2 else 3,
            )
            if (!state.timeLine.isNullOrBlank()) {
                Spacer(modifier = GlanceModifier.height(6.dp))
                Text(
                    text = state.timeLine,
                    style = TextStyle(
                        color = accent,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                    ),
                    maxLines = 1,
                )
            }
            if (isMedium && !state.detail.isNullOrBlank()) {
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
        }
        Spacer(modifier = GlanceModifier.defaultWeight())
    }
}

class NextGameWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = NextGameGlanceWidget()
}
