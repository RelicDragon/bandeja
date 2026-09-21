package com.funified.bandeja.push;

import android.app.Notification;
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

/**
 * PRD 345 / 357 — renders a push whose shade buttons come from
 * {@link TokenActionPushData}.
 *
 * <p>Token buttons post from the shade through {@link TokenActionReceiver};
 * foreground buttons open the app on the same payload a body tap would use, so
 * the destination (`weatherDeepLink`, `sourceGameId`) is decided by the server
 * and handled by the web layer.
 */
public final class TokenActionNotificationHelper {
    public static final String ACTION_TOKEN = "com.funified.bandeja.TOKEN_ACTION";

    private TokenActionNotificationHelper() {}

    /**
     * Returns {@code false} when this push cannot be rendered with its buttons,
     * so the caller falls back to the ordinary data notification. A push that
     * cannot offer its buttons must still reach the player.
     */
    public static boolean show(Context context, Map<String, String> data) {
        TokenActionPushData parsed = TokenActionPushData.fromMap(data);
        if (parsed == null) {
            return false;
        }

        ChatNotificationHelper.ensureChannel(context);
        NotificationManager manager =
            ContextCompat.getSystemService(context, NotificationManager.class);
        if (manager == null) {
            return false;
        }

        int flags = pendingIntentFlags();
        int notificationId = parsed.notificationId();

        Bundle tapExtras = new Bundle();
        for (Map.Entry<String, String> entry : DataPushNotificationHelper.tapExtrasMap(data).entrySet()) {
            tapExtras.putString(entry.getKey(), entry.getValue());
        }
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            notificationId,
            PushTapIntentFactory.build(context, tapExtras, DataPushNotificationHelper.messageId(data)),
            flags
        );

        String title = parsed.title != null ? parsed.title : context.getString(R.string.app_name);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            context,
            ChatNotificationHelper.CHANNEL_MESSAGES
        )
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(parsed.body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .setGroup(parsed.type);
        if (parsed.body != null) {
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(parsed.body));
        }

        int requestCode = notificationId;
        for (TokenActionPushData.Action action : parsed.actions) {
            requestCode += 1;
            PendingIntent pending = action.isForeground()
                ? PendingIntent.getActivity(
                    context,
                    requestCode,
                    // The foreground button lands exactly where a body tap would;
                    // the server put the destination in the payload.
                    PushTapIntentFactory.build(
                        context,
                        tapExtras,
                        DataPushNotificationHelper.messageId(data) + ":" + action.id
                    ),
                    flags
                )
                : PendingIntent.getBroadcast(
                    context,
                    requestCode,
                    tokenIntent(context, parsed, action),
                    flags
                );
            builder.addAction(0, action.title, pending);
        }

        manager.notify(notificationId, builder.build());
        return true;
    }

    /**
     * Replaces the card with the answer acknowledgement. Nothing moved that the
     * player needs to check, so this is a quiet, swipeable card.
     */
    static Notification buildAcknowledgement(
        Context context,
        String type,
        String gameId,
        String ackText
    ) {
        Bundle extras = new Bundle();
        if (type != null) {
            extras.putString("type", type);
        }
        if (gameId != null) {
            extras.putString("gameId", gameId);
        }
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            (type + ":ack:" + gameId).hashCode() & 0x7fffffff,
            PushTapIntentFactory.build(context, extras, type + ":token-action-ack:" + gameId),
            pendingIntentFlags()
        );

        return new NotificationCompat.Builder(context, ChatNotificationHelper.CHANNEL_MESSAGES)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(context.getString(R.string.app_name))
            .setContentText(ackText)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setContentIntent(contentIntent)
            .build();
    }

    private static Intent tokenIntent(
        Context context,
        TokenActionPushData parsed,
        TokenActionPushData.Action action
    ) {
        Intent intent = new Intent(context, TokenActionReceiver.class);
        intent.setAction(ACTION_TOKEN);
        intent.putExtra("notificationId", parsed.notificationId());
        intent.putExtra("pushType", parsed.type);
        if (parsed.gameId != null) {
            intent.putExtra("gameId", parsed.gameId);
        }
        intent.putExtra("actionToken", action.actionToken);
        if (action.ack != null) {
            intent.putExtra("ackText", action.ack);
        }
        return intent;
    }

    private static int pendingIntentFlags() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return flags;
    }
}
