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
 * PRD 345 / 357 — posts a signed push action from the shade without opening the
 * app.
 *
 * <p>The signed token is the whole request: the endpoint is unauthenticated and
 * the token names the player, the target and the action. Nothing here decides
 * anything — a `series:accept` seats the player on next week's occurrence and a
 * `weather:keep` silences the follow-up alert, both because the server says so.
 */
public class TokenActionReceiver extends BroadcastReceiver {
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !TokenActionNotificationHelper.ACTION_TOKEN.equals(intent.getAction())) {
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
            // Leave the card in place. Both families are answerable again from
            // the app, so a dropped tap costs nothing but the tap.
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
                    TokenActionNotificationHelper.buildAcknowledgement(
                        context,
                        intent.getStringExtra("pushType"),
                        intent.getStringExtra("gameId"),
                        ackText
                    )
                );
            } else {
                manager.cancel(notificationId);
            }
            return;
        }

        // 4xx means the server will not accept this answer (expired token, seat
        // already taken, game already moved). Anything else is worth keeping.
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
