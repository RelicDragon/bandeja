package com.funified.bandeja.push;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import androidx.core.app.RemoteInput;
import androidx.core.content.ContextCompat;
import com.funified.bandeja.R;
import com.funified.bandeja.auth.AppBadgeStorage;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class ChatNotificationHelper {
    public static final String CHANNEL_MESSAGES = "channel_messages";
    public static final String ACTION_REPLY = "com.funified.bandeja.CHAT_REPLY";
    public static final String KEY_REPLY = "key_reply";
    private static final String NOTIFICATION_GROUP_KEY = "bandeja_chat_messages";

    private static final ExecutorService IMAGE_EXECUTOR = Executors.newSingleThreadExecutor();
    private static final ExecutorService RECEIPT_EXECUTOR = Executors.newSingleThreadExecutor();
    private static final Handler MAIN_HANDLER = new Handler(Looper.getMainLooper());

    private ChatNotificationHelper() {}

    public static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = notificationManager(context);
        if (manager == null) {
            return;
        }
        NotificationChannel existing = manager.getNotificationChannel(CHANNEL_MESSAGES);
        if (existing != null) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_MESSAGES,
            context.getString(R.string.notification_channel_messages),
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(context.getString(R.string.notification_channel_messages_desc));
        manager.createNotificationChannel(channel);
    }

    public static void showIncomingMessage(Context context, Map<String, String> data) {
        ChatPushData pushData = ChatPushData.fromMap(data);
        if (pushData == null) {
            return;
        }
        applyUnreadBadgeFromData(context, data);
        ensureChannel(context);
        NotificationManager manager = notificationManager(context);
        if (manager == null) {
            return;
        }

        int notificationId = pushData.notificationId();
        if (pushData.previewImageUrl != null) {
            IMAGE_EXECUTOR.execute(() -> {
                Bitmap bitmap = downloadBitmap(pushData.previewImageUrl);
                MAIN_HANDLER.post(() -> {
                    manager.notify(notificationId, buildNotification(context, pushData, null, bitmap));
                });
            });
        } else {
            manager.notify(notificationId, buildNotification(context, pushData, null, null));
        }

        confirmReceiptAsync(context, pushData);
    }

    public static void showOutgoingReply(Context context, ChatPushData pushData, String replyText) {
        ensureChannel(context);
        NotificationManager manager = notificationManager(context);
        if (manager == null) {
            return;
        }
        manager.notify(pushData.notificationId(), buildNotification(context, pushData, replyText, null));
    }

    public static void showReplyFailed(Context context) {
        ensureChannel(context);
        NotificationManager manager = notificationManager(context);
        if (manager == null) {
            return;
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_MESSAGES)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(context.getString(R.string.push_reply_failed))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true);

        manager.notify((int) (System.currentTimeMillis() % Integer.MAX_VALUE), builder.build());
    }

    public static Bundle replyExtras(ChatPushData pushData) {
        Bundle extras = new Bundle();
        extras.putString("type", pushData.type);
        extras.putString("chatContextType", pushData.chatContextType);
        extras.putString("contextId", pushData.contextId);
        extras.putString("messageId", pushData.messageId);
        if (pushData.chatType != null) {
            extras.putString("chatType", pushData.chatType);
        }
        if (pushData.title != null) {
            extras.putString("title", pushData.title);
        }
        if (pushData.body != null) {
            extras.putString("body", pushData.body);
        }
        if (pushData.senderName != null) {
            extras.putString("senderName", pushData.senderName);
        }
        if (pushData.replyToken != null) {
            extras.putString("replyToken", pushData.replyToken);
        }
        if (pushData.threadId != null) {
            extras.putString("threadId", pushData.threadId);
        }
        if (pushData.userChatId != null) {
            extras.putString("userChatId", pushData.userChatId);
        }
        if (pushData.gameId != null) {
            extras.putString("gameId", pushData.gameId);
        }
        if (pushData.groupChannelId != null) {
            extras.putString("groupChannelId", pushData.groupChannelId);
        }
        if (pushData.bugId != null) {
            extras.putString("bugId", pushData.bugId);
        }
        if (pushData.marketItemId != null) {
            extras.putString("marketItemId", pushData.marketItemId);
        }
        if (pushData.previewImageUrl != null) {
            extras.putString("previewImageUrl", pushData.previewImageUrl);
        }
        return extras;
    }

    private static android.app.Notification buildNotification(
        Context context,
        ChatPushData pushData,
        String outgoingReply,
        Bitmap previewBitmap
    ) {
        String senderLabel = pushData.senderName != null ? pushData.senderName : pushData.title;
        if (senderLabel == null) {
            senderLabel = context.getString(R.string.app_name);
        }

        Person sender = new Person.Builder().setName(senderLabel).build();
        Person self = new Person.Builder().setName(context.getString(R.string.push_reply_self)).build();

        NotificationCompat.MessagingStyle style = new NotificationCompat.MessagingStyle(self);
        if (pushData.title != null) {
            style.setConversationTitle(pushData.title);
        }
        if (outgoingReply != null && !outgoingReply.isEmpty()) {
            style.addMessage(outgoingReply, System.currentTimeMillis(), self);
        } else if (pushData.body != null) {
            style.addMessage(pushData.body, System.currentTimeMillis(), sender);
        }

        RemoteInput remoteInput = new RemoteInput.Builder(KEY_REPLY)
            .setLabel(context.getString(R.string.push_reply_hint))
            .build();

        Intent replyIntent = new Intent(context, ChatReplyReceiver.class);
        replyIntent.setAction(ACTION_REPLY);
        replyIntent.putExtras(replyExtras(pushData));

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_MUTABLE;
        }

        PendingIntent replyPendingIntent = PendingIntent.getBroadcast(
            context,
            pushData.notificationId(),
            replyIntent,
            flags
        );

        NotificationCompat.Action replyAction = new NotificationCompat.Action.Builder(
            android.R.drawable.ic_menu_send,
            context.getString(R.string.push_reply_hint),
            replyPendingIntent
        )
            .addRemoteInput(remoteInput)
            .setAllowGeneratedReplies(true)
            .build();

        android.content.Intent tapIntent = PushTapIntentFactory.build(
            context,
            replyExtras(pushData),
            pushData.messageId
        );

        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            pushData.notificationId() + 1,
            tapIntent,
            flags
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_MESSAGES)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setStyle(style)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setGroup(NOTIFICATION_GROUP_KEY)
            .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
            .setSortKey(pushData.conversationKey())
            .setContentIntent(contentIntent)
            .addAction(replyAction);

        if (previewBitmap != null) {
            builder.setLargeIcon(previewBitmap);
        }

        int unreadBadge = pushData.unreadBadgeCount != null ? pushData.unreadBadgeCount : -1;
        if (unreadBadge > 0) {
            builder.setNumber(unreadBadge);
        }

        return builder.build();
    }

    private static void applyUnreadBadgeFromData(Context context, Map<String, String> data) {
        if (data == null) {
            return;
        }
        int count = parseUnreadBadgeCount(data.get("unreadBadgeCount"));
        if (count < 0) {
            return;
        }
        AppBadgeStorage.setCount(context, count);
    }

    private static int parseUnreadBadgeCount(String raw) {
        if (raw == null) {
            return -1;
        }
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) {
            return -1;
        }
        try {
            return Math.max(0, Integer.parseInt(trimmed));
        } catch (NumberFormatException ignored) {
            return -1;
        }
    }

    private static Bitmap downloadBitmap(String imageUrl) {
        if (imageUrl == null || !imageUrl.startsWith("https://")) {
            return null;
        }
        HttpURLConnection connection = null;
        try {
            URL url = new URL(imageUrl);
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(5000);
            connection.setInstanceFollowRedirects(true);
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
                return null;
            }
            try (InputStream input = connection.getInputStream()) {
                return BitmapFactory.decodeStream(input);
            }
        } catch (Exception ignored) {
            return null;
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private static void confirmReceiptAsync(Context context, ChatPushData pushData) {
        RECEIPT_EXECUTOR.execute(() -> {
            if (pushData.replyToken != null && !pushData.replyToken.isEmpty()) {
                ChatReplyApiClient.confirmReceiptWithToken(context, pushData.replyToken);
                return;
            }
            String token = com.funified.bandeja.auth.SecureTokenStorage.getToken(context);
            if (token == null || token.isEmpty()) {
                return;
            }
            ChatReplyApiClient.confirmReceipt(context, token, pushData.messageId);
        });
    }

    private static NotificationManager notificationManager(Context context) {
        return ContextCompat.getSystemService(context, NotificationManager.class);
    }
}
