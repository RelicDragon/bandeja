package com.funified.bandeja.push;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * PRD 346 — posts an attendance answer from the shade without opening the app.
 *
 * <p>The signed action token is the whole request: the endpoint is
 * unauthenticated and the token names the player, the game and the answer.
 * Nothing here can change a seat or a queue position.
 */
public class AttendanceActionReceiver extends BroadcastReceiver {
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) {
            return;
        }
        if (!AttendanceNotificationHelper.ACTION_CONFIRM.equals(intent.getAction())
            && !AttendanceNotificationHelper.ACTION_UNSURE.equals(intent.getAction())) {
            return;
        }

        final PendingResult pendingResult = goAsync();
        final Context appContext = context.getApplicationContext();

        EXECUTOR.execute(() -> {
            try {
                handleAction(appContext, intent);
            } finally {
                pendingResult.finish();
            }
        });
    }

    private void handleAction(Context context, Intent intent) {
        String actionToken = intent.getStringExtra("actionToken");
        if (actionToken == null || actionToken.isEmpty()) {
            return;
        }
        if (!isOnline(context)) {
            // Leave the reminder in place — there is no deadline, so the player
            // can simply answer again later.
            return;
        }

        ChatReplyApiClient.ApiResult result =
            ChatReplyApiClient.performInviteAction(context, actionToken);
        finishAction(context, intent, result);
    }

    private void finishAction(Context context, Intent intent, ChatReplyApiClient.ApiResult result) {
        int notificationId = intent.getIntExtra("notificationId", Integer.MIN_VALUE);
        if (notificationId == Integer.MIN_VALUE) {
            return;
        }
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }

        if (result.success) {
            String ackText = intent.getStringExtra("ackText");
            if (ackText != null && !ackText.isEmpty()) {
                manager.notify(
                    notificationId,
                    AttendanceNotificationHelper.buildAcknowledgement(
                        context,
                        intent.getStringExtra("gameId"),
                        ackText
                    )
                );
            } else {
                manager.cancel(notificationId);
            }
            return;
        }

        // 4xx means the server will not accept this answer (expired token, the
        // player already left). Anything else is worth keeping for a retry.
        if (result.statusCode >= 400 && result.statusCode < 500) {
            manager.cancel(notificationId);
        }
    }

    private boolean isOnline(Context context) {
        ConnectivityManager manager = context.getSystemService(ConnectivityManager.class);
        if (manager == null) {
            return false;
        }
        Network network = manager.getActiveNetwork();
        if (network == null) {
            return false;
        }
        NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
        return capabilities != null
            && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }
}
