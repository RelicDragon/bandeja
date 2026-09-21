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

        if (
            "attendance_actions".equals(nativeHandler) ||
            AttendancePushData.hasAttendanceActions(data)
        ) {
            // Falls through to the ordinary reminder below when the payload
            // cannot carry the two actions, so the player still gets told.
            if (AttendanceNotificationHelper.show(getApplicationContext(), data)) {
                return;
            }
        }

        if (
            "series_actions".equals(nativeHandler) ||
            "weather_actions".equals(nativeHandler) ||
            "weather_organizer_actions".equals(nativeHandler) ||
            TokenActionPushData.hasTokenActions(data)
        ) {
            // Falls through to the ordinary data notification below when the
            // payload cannot carry its buttons, so the player still gets told.
            if (TokenActionNotificationHelper.show(getApplicationContext(), data)) {
                return;
            }
        }

        if (
            "play_intent_actions".equals(nativeHandler) ||
            PlayIntentPushData.isPlayIntent(data)
        ) {
            PlayIntentNotificationHelper.show(getApplicationContext(), data);
            return;
        }

        if (remoteMessage.getNotification() == null && DataPushNotificationHelper.canShow(data)) {
            DataPushNotificationHelper.show(getApplicationContext(), data);
            return;
        }

        PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        PushNotificationsPlugin.onNewToken(token);
    }
}
