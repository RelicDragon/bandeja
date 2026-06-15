package com.funified.bandeja.push;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.RemoteInput;
import com.funified.bandeja.auth.SecureTokenStorage;
import com.funified.bandeja.auth.AppBadgeStorage;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ChatReplyReceiver extends BroadcastReceiver {
    private static final ExecutorService REPLY_EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ChatNotificationHelper.ACTION_REPLY.equals(intent.getAction())) {
            return;
        }

        final PendingResult pendingResult = goAsync();
        final Context appContext = context.getApplicationContext();

        REPLY_EXECUTOR.execute(() -> {
            try {
                handleReply(appContext, intent);
            } finally {
                pendingResult.finish();
            }
        });
    }

    private void handleReply(Context context, Intent intent) {
        Bundle remoteInput = RemoteInput.getResultsFromIntent(intent);
        if (remoteInput == null) {
            ChatNotificationHelper.showReplyFailed(context);
            return;
        }

        CharSequence replyChars = remoteInput.getCharSequence(ChatNotificationHelper.KEY_REPLY);
        if (replyChars == null) {
            ChatNotificationHelper.showReplyFailed(context);
            return;
        }

        ChatPushData pushData = ChatPushData.fromBundle(intent.getExtras());
        if (pushData == null) {
            ChatNotificationHelper.showReplyFailed(context);
            return;
        }

        String replyText = pushData.truncateReply(replyChars.toString());
        if (replyText.isEmpty()) {
            return;
        }

        if (!isOnline(context)) {
            ChatNotificationHelper.showReplyFailed(context);
            return;
        }

        ChatReplyApiClient.ApiResult createResult;
        boolean usedReplyToken = pushData.replyToken != null && !pushData.replyToken.isEmpty();
        if (usedReplyToken) {
            createResult = ChatReplyApiClient.sendPushReply(context, pushData, replyText);
        } else {
            String token = SecureTokenStorage.getToken(context);
            if (token == null || token.isEmpty()) {
                ChatNotificationHelper.showReplyFailed(context);
                return;
            }
            createResult = ChatReplyApiClient.createMessage(context, token, pushData, replyText);
        }

        if (!createResult.success) {
            ChatNotificationHelper.showReplyFailed(context);
            return;
        }

        ChatNotificationHelper.showOutgoingReply(context, pushData, replyText);
        afterSuccessfulReply(context, pushData, usedReplyToken, createResult);
    }

    private void afterSuccessfulReply(
        Context context,
        ChatPushData pushData,
        boolean usedReplyToken,
        ChatReplyApiClient.ApiResult createResult
    ) {
        if (createResult.unreadBadgeCount >= 0) {
            AppBadgeStorage.setCount(context, createResult.unreadBadgeCount);
        }

        if (usedReplyToken) {
            return;
        }

        String token = SecureTokenStorage.getToken(context);
        if (token == null || token.isEmpty()) {
            return;
        }
        ChatReplyApiClient.confirmReceipt(context, token, pushData.messageId);
        ChatReplyApiClient.markContextAsRead(context, token, pushData);
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
