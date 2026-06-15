package com.funified.bandeja.push;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
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
                ChatReplyApiClient.acceptTeamInvite(context, token, teamId);
            } else {
                ChatReplyApiClient.declineTeamInvite(context, token, teamId);
            }
            return;
        }

        String inviteId = intent.getStringExtra("inviteId");
        if (inviteId == null || inviteId.isEmpty()) {
            return;
        }
        if (accept) {
            ChatReplyApiClient.acceptInvite(context, inviteId);
        } else {
            ChatReplyApiClient.declineInvite(context, inviteId);
        }
    }

    private boolean isOnline(Context context) {
        ConnectivityManager manager = context.getSystemService(ConnectivityManager.class);
        if (manager == null) {
            return false;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Network network = manager.getActiveNetwork();
            if (network == null) {
                return false;
            }
            NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
            return capabilities != null
                && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        }
        android.net.NetworkInfo networkInfo = manager.getActiveNetworkInfo();
        return networkInfo != null && networkInfo.isConnected();
    }
}
