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

/** PRD 346 — the reminder with "I'm coming" / "Not sure yet" shade actions. */
public final class AttendanceNotificationHelper {
    public static final String ACTION_CONFIRM = "com.funified.bandeja.ATTENDANCE_CONFIRM";
    public static final String ACTION_UNSURE = "com.funified.bandeja.ATTENDANCE_UNSURE";

    private AttendanceNotificationHelper() {}

    /**
     * Returns {@code false} when this reminder cannot be rendered with the two
     * actions, so the caller can fall back to the ordinary reminder. A reminder
     * that cannot offer its buttons must still reach the player — dropping it
     * would turn a missing token into a missing notification.
     */
    public static boolean show(Context context, Map<String, String> data) {
        AttendancePushData attendance = AttendancePushData.fromMap(data);
        if (attendance == null) {
            return false;
        }

        ChatNotificationHelper.ensureChannel(context);
        NotificationManager manager =
            ContextCompat.getSystemService(context, NotificationManager.class);
        if (manager == null) {
            return false;
        }

        int flags = pendingIntentFlags();
        int notificationId = attendance.notificationId();

        PendingIntent confirmPending = PendingIntent.getBroadcast(
            context,
            notificationId,
            answerIntent(context, ACTION_CONFIRM, attendance, attendance.confirmActionToken, attendance.confirmedAck),
            flags
        );
        PendingIntent unsurePending = PendingIntent.getBroadcast(
            context,
            notificationId + 1,
            answerIntent(context, ACTION_UNSURE, attendance, attendance.unsureActionToken, attendance.unsureAck),
            flags
        );

        // Tapping the reminder must behave exactly like a reminder without the
        // actions, so the tap payload is the shared one (minus the signed tokens).
        Bundle tapExtras = new Bundle();
        for (Map.Entry<String, String> entry : DataPushNotificationHelper.tapExtrasMap(data).entrySet()) {
            tapExtras.putString(entry.getKey(), entry.getValue());
        }
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            notificationId + 2,
            PushTapIntentFactory.build(context, tapExtras, DataPushNotificationHelper.messageId(data)),
            flags
        );

        String confirmLabel = attendance.confirmActionTitle != null
            ? attendance.confirmActionTitle
            : context.getString(R.string.attendance_confirm);
        String unsureLabel = attendance.unsureActionTitle != null
            ? attendance.unsureActionTitle
            : context.getString(R.string.attendance_unsure);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            context,
            ChatNotificationHelper.CHANNEL_MESSAGES
        )
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(
                attendance.title != null ? attendance.title : context.getString(R.string.app_name)
            )
            .setContentText(attendance.body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .setGroup("GAME_REMINDER")
            .addAction(0, confirmLabel, confirmPending)
            .addAction(0, unsureLabel, unsurePending);
        if (attendance.body != null) {
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(attendance.body));
        }

        manager.notify(notificationId, builder.build());
        return true;
    }

    /**
     * Replaces the reminder with the answer acknowledgement. The seat never
     * moved, so this is a quiet, low-priority card that can simply be swiped.
     */
    static Notification buildAcknowledgement(Context context, String gameId, String ackText) {
        Bundle extras = new Bundle();
        extras.putString("type", "GAME_REMINDER");
        if (gameId != null) {
            extras.putString("gameId", gameId);
        }
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            ("GAME_REMINDER:ack:" + gameId).hashCode() & 0x7fffffff,
            PushTapIntentFactory.build(context, extras, "GAME_REMINDER:attendance-ack:" + gameId),
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

    private static Intent answerIntent(
        Context context,
        String action,
        AttendancePushData attendance,
        String actionToken,
        String ackText
    ) {
        Intent intent = new Intent(context, AttendanceActionReceiver.class);
        intent.setAction(action);
        intent.putExtra("notificationId", attendance.notificationId());
        if (attendance.gameId != null) {
            intent.putExtra("gameId", attendance.gameId);
        }
        if (actionToken != null) {
            intent.putExtra("actionToken", actionToken);
        }
        if (ackText != null) {
            intent.putExtra("ackText", ackText);
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
