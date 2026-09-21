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
import java.util.HashMap;
import java.util.Map;

public final class DataPushNotificationHelper {
    private static final String[] SKIP_TAP_KEYS = {
        "replyToken",
        "acceptActionToken",
        "declineActionToken",
        "attendanceActionToken",
        "attendanceUnsureActionToken",
        // PRD 357 — never carry the signed keep token into a tap payload.
        "weatherKeepActionToken",
        "actionToken",
        "nativeHandler",
        PushTapIntentFactory.EXTRA_GOOGLE_MESSAGE_ID,
        PushTapStore.EXTRA_PUSH_TAP_ID
    };

    private DataPushNotificationHelper() {}

    public static boolean canShow(Map<String, String> data) {
        return data != null
            && trim(data.get("type")) != null
            && (trim(data.get("title")) != null || trim(data.get("body")) != null);
    }

    public static Map<String, String> tapExtrasMap(Map<String, String> data) {
        Map<String, String> extras = new HashMap<>();
        if (data == null) {
            return extras;
        }
        for (Map.Entry<String, String> entry : data.entrySet()) {
            String key = entry.getKey();
            String value = trim(entry.getValue());
            if (key == null || value == null || shouldSkipTapKey(key)) {
                continue;
            }
            extras.put(key, value);
        }
        return extras;
    }

    public static void show(Context context, Map<String, String> data) {
        if (!canShow(data)) {
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
        for (Map.Entry<String, String> entry : tapExtrasMap(data).entrySet()) {
            extras.putString(entry.getKey(), entry.getValue());
        }

        String type = trim(data.get("type"));
        int notificationId = notificationId(data);
        Intent tapIntent = PushTapIntentFactory.build(context, extras, messageId(data));
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            notificationId,
            tapIntent,
            flags
        );

        String title = trim(data.get("title"));
        if (title == null) {
            title = context.getString(R.string.app_name);
        }
        String body = trim(data.get("body"));

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            context,
            ChatNotificationHelper.CHANNEL_MESSAGES
        )
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .setGroup(type);
        if (body != null) {
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(body));
        }

        manager.notify(notificationId, builder.build());
    }

    static int notificationId(Map<String, String> data) {
        String type = trim(data.get("type"));
        String identity = firstPresent(
            data,
            "gameId",
            "marketItemId",
            "teamId",
            "playIntentId",
            "proposalId",
            "bugId",
            "userChatId",
            "groupChannelId"
        );
        String key = (type != null ? type : "push") + ":" + (identity != null ? identity : "tap");
        return key.hashCode() & 0x7fffffff;
    }

    static String messageId(Map<String, String> data) {
        String googleId = trim(data.get(PushTapIntentFactory.EXTRA_GOOGLE_MESSAGE_ID));
        if (googleId != null) {
            return googleId;
        }
        return "bandeja-data-push:" + notificationId(data);
    }

    private static boolean shouldSkipTapKey(String key) {
        for (String skip : SKIP_TAP_KEYS) {
            if (skip.equals(key)) {
                return true;
            }
        }
        return key.startsWith("google.") || key.startsWith("gcm.");
    }

    private static String firstPresent(Map<String, String> data, String... keys) {
        for (String key : keys) {
            String value = trim(data.get(key));
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private static String trim(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
