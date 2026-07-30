package com.funified.bandeja.push;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.funified.bandeja.R;
import java.util.Map;

public final class PlayIntentNotificationHelper {
    private PlayIntentNotificationHelper() {}

    public static void show(Context context, Map<String, String> data) {
        PlayIntentPushData intent = PlayIntentPushData.fromMap(data);
        if (intent == null) {
            return;
        }

        ChatNotificationHelper.ensureChannel(context);
        NotificationManager manager =
            ContextCompat.getSystemService(context, NotificationManager.class);
        if (manager == null) {
            return;
        }

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }

        Bundle extras = new Bundle();
        extras.putString("type", intent.type);
        extras.putString("playIntentId", intent.playIntentId);
        if (intent.title != null) {
            extras.putString("title", intent.title);
        }
        if (intent.body != null) {
            extras.putString("body", intent.body);
        }

        Intent tapIntent =
            PushTapIntentFactory.build(context, extras, intent.messageId());
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            intent.notificationId(),
            tapIntent,
            flags
        );

        Intent actionIntent =
            PushTapIntentFactory.build(context, extras, intent.messageId());
        PendingIntent actionPending = PendingIntent.getActivity(
            context,
            intent.notificationId() + 1,
            actionIntent,
            flags
        );

        String actionLabel = intent.playTooActionTitle != null
            ? intent.playTooActionTitle
            : context.getString(R.string.play_intent_play_too);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            context,
            ChatNotificationHelper.CHANNEL_MESSAGES
        )
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(
                intent.title != null
                    ? intent.title
                    : context.getString(R.string.app_name)
            )
            .setContentText(intent.body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(intent.body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .addAction(0, actionLabel, actionPending);

        manager.notify(intent.notificationId(), builder.build());
    }
}
