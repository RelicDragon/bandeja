package com.funified.bandeja.push;

import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

public class ChatReplyMessagingService extends FirebaseMessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        if (data == null || data.isEmpty()) {
            PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
            return;
        }

        if (ChatPushData.isReplyable(data)) {
            ChatNotificationHelper.showIncomingMessage(getApplicationContext(), data);
            return;
        }

        String nativeHandler = data.get("nativeHandler");
        if ("invite_actions".equals(nativeHandler) || InvitePushData.isInvite(data)) {
            InviteNotificationHelper.showInvite(getApplicationContext(), data);
            return;
        }

        PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        PushNotificationsPlugin.onNewToken(token);
    }
}
