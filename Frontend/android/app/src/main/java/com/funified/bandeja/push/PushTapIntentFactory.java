package com.funified.bandeja.push;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

/**
 * Builds PendingIntent targets for notification content taps.
 *
 * Routes through {@link NotificationOpenActivity} so MainActivity's singleTask
 * root never retains google.message_id (Capacitor would re-deliver the tap on
 * every cold start).
 */
public final class PushTapIntentFactory {
    public static final String ACTION_PUSH_OPEN = "com.funified.bandeja.PUSH_OPEN";
    public static final String EXTRA_GOOGLE_MESSAGE_ID = "google.message_id";

    private PushTapIntentFactory() {}

    public static Intent build(Context context, Bundle extras, String messageId) {
        Intent intent = new Intent(context, NotificationOpenActivity.class);
        intent.setAction(ACTION_PUSH_OPEN);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (extras != null) {
            intent.putExtras(extras);
        }
        if (messageId != null) {
            intent.putExtra(EXTRA_GOOGLE_MESSAGE_ID, messageId);
        }
        return intent;
    }
}
