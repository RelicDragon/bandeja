package com.funified.bandeja.push;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.funified.bandeja.MainActivity;
import com.funified.bandeja.R;
import java.util.Map;

public final class InviteNotificationHelper {
    public static final String ACTION_ACCEPT = "com.funified.bandeja.INVITE_ACCEPT";
    public static final String ACTION_DECLINE = "com.funified.bandeja.INVITE_DECLINE";

    private InviteNotificationHelper() {}

    public static void showInvite(Context context, Map<String, String> data) {
        InvitePushData invite = InvitePushData.fromMap(data);
        if (invite == null) {
            return;
        }

        ChatNotificationHelper.ensureChannel(context);
        NotificationManager manager = ContextCompat.getSystemService(context, NotificationManager.class);
        if (manager == null) {
            return;
        }

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_MUTABLE;
        }

        Intent acceptIntent = new Intent(context, InviteActionReceiver.class);
        acceptIntent.setAction(ACTION_ACCEPT);
        acceptIntent.putExtra("type", invite.type);
        if (invite.inviteId != null) {
            acceptIntent.putExtra("inviteId", invite.inviteId);
        }
        if (invite.teamId != null) {
            acceptIntent.putExtra("teamId", invite.teamId);
        }
        if (invite.gameId != null) {
            acceptIntent.putExtra("gameId", invite.gameId);
        }

        Intent declineIntent = new Intent(context, InviteActionReceiver.class);
        declineIntent.setAction(ACTION_DECLINE);
        declineIntent.putExtra("type", invite.type);
        if (invite.inviteId != null) {
            declineIntent.putExtra("inviteId", invite.inviteId);
        }
        if (invite.teamId != null) {
            declineIntent.putExtra("teamId", invite.teamId);
        }

        PendingIntent acceptPending = PendingIntent.getBroadcast(
            context,
            invite.notificationId(),
            acceptIntent,
            flags
        );
        PendingIntent declinePending = PendingIntent.getBroadcast(
            context,
            invite.notificationId() + 1,
            declineIntent,
            flags
        );

        Intent tapIntent = new Intent(context, MainActivity.class);
        tapIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (invite.gameId != null) {
            tapIntent.putExtra("gameId", invite.gameId);
        }
        if (invite.teamId != null) {
            tapIntent.putExtra("teamId", invite.teamId);
        }
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            invite.notificationId() + 2,
            tapIntent,
            flags
        );

        String acceptLabel = invite.acceptActionTitle != null
            ? invite.acceptActionTitle
            : context.getString(R.string.invite_accept);
        String declineLabel = invite.declineActionTitle != null
            ? invite.declineActionTitle
            : context.getString(R.string.invite_decline);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, ChatNotificationHelper.CHANNEL_MESSAGES)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(invite.title != null ? invite.title : context.getString(R.string.app_name))
            .setContentText(invite.body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(invite.body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .addAction(0, acceptLabel, acceptPending)
            .addAction(0, declineLabel, declinePending);

        manager.notify(invite.notificationId(), builder.build());
    }
}
