package com.funified.bandeja.push;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.app.NotificationManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import com.funified.bandeja.auth.SecureTokenStorage;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class InviteActionReceiver extends BroadcastReceiver {
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) {
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
        if (!isOnline(context)) {
            return;
        }

        String actionToken = intent.getStringExtra("actionToken");
        if (actionToken != null && !actionToken.isEmpty()) {
            finishAction(context, intent, ChatReplyApiClient.performInviteAction(context, actionToken));
            return;
        }

        // Compatibility for notifications delivered by older backend builds.
        String token = SecureTokenStorage.getToken(context);
        if (token == null || token.isEmpty()) {
            return;
        }

        String type = intent.getStringExtra("type");
        boolean accept = InviteNotificationHelper.ACTION_ACCEPT.equals(intent.getAction());

        if ("TEAM_INVITE".equals(type)) {
            String teamId = intent.getStringExtra("teamId");
            if (teamId == null || teamId.isEmpty()) {
                return;
            }
            if (accept) {
                finishAction(context, intent, ChatReplyApiClient.acceptTeamInvite(context, token, teamId));
            } else {
                finishAction(context, intent, ChatReplyApiClient.declineTeamInvite(context, token, teamId));
            }
            return;
        }

        String inviteId = intent.getStringExtra("inviteId");
        if (inviteId == null || inviteId.isEmpty()) {
            return;
        }
        if (accept) {
            finishAction(context, intent, ChatReplyApiClient.acceptInvite(context, token, inviteId));
        } else {
            finishAction(context, intent, ChatReplyApiClient.declineInvite(context, token, inviteId));
        }
    }

    private void finishAction(Context context, Intent intent, ChatReplyApiClient.ApiResult result) {
        // Keep the action available for connection/5xx failures, but remove a notification
        // once the server accepted it or confirmed that it can no longer be performed.
        if (!result.success && (result.statusCode < 400 || result.statusCode >= 500)) {
            return;
        }
        int notificationId = intent.getIntExtra("notificationId", Integer.MIN_VALUE);
        if (notificationId == Integer.MIN_VALUE) {
            return;
        }
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) {
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
