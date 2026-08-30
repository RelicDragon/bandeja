package com.funified.bandeja.push;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import java.util.Collections;
import java.util.Set;

/**
 * Detects and clears launcher Intent extras left by legacy notification taps
 * (MAIN/LAUNCHER + google.message_id / JWTs) that poison singleTask roots.
 */
public final class PushIntentSanitizer {
    private PushIntentSanitizer() {}

    public static boolean isLauncherLike(Intent intent) {
        if (intent == null) {
            return false;
        }
        if (Intent.ACTION_MAIN.equals(intent.getAction())) {
            return true;
        }
        return intent.getCategories() != null
            && intent.getCategories().contains(Intent.CATEGORY_LAUNCHER);
    }

    public static boolean hasPushPoison(Intent intent) {
        if (intent == null) {
            return false;
        }
        Bundle extras = intent.getExtras();
        if (extras == null) {
            return false;
        }
        return hasPushPoisonKeys(extras.keySet());
    }

    /** Pure key-set check for unit tests and Intent sanitizing. */
    public static boolean hasPushPoisonKeys(Set<String> keys) {
        if (keys == null || keys.isEmpty()) {
            return false;
        }
        if (keys.contains(PushTapIntentFactory.EXTRA_GOOGLE_MESSAGE_ID)) {
            return true;
        }
        if (keys.contains(PushTapStore.EXTRA_PUSH_TAP_ID)) {
            return true;
        }
        if (keys.contains("replyToken")
            || keys.contains("acceptActionToken")
            || keys.contains("declineActionToken")
            || keys.contains("actionToken")
            || keys.contains("nativeHandler")) {
            return true;
        }
        if (!keys.contains("type")) {
            return false;
        }
        return keys.contains("messageId")
            || keys.contains("inviteId")
            || keys.contains("playIntentId")
            || keys.contains("chatContextType")
            || keys.contains("gameId")
            || keys.contains("teamId");
    }

    /**
     * Drops all extras on poisoned launcher intents while preserving deep-link data.
     * Returns true when extras were cleared.
     */
    public static boolean stripPoisonedLauncherExtras(Intent intent) {
        if (!isLauncherLike(intent) || !hasPushPoison(intent)) {
            return false;
        }
        Uri data = intent.getData();
        intent.replaceExtras((Bundle) null);
        if (data != null) {
            intent.setData(data);
        }
        return true;
    }

    /** Clears push markers from any intent Cap may re-read after load/onNewIntent. */
    public static boolean clearPushMarkers(Intent intent) {
        if (intent == null) {
            return false;
        }
        Bundle extras = intent.getExtras();
        if (extras == null) {
            return false;
        }
        Set<String> keys = extras.keySet() != null ? extras.keySet() : Collections.emptySet();
        if (!hasPushPoisonKeys(keys)) {
            return false;
        }
        Uri data = intent.getData();
        intent.replaceExtras((Bundle) null);
        if (data != null) {
            intent.setData(data);
        }
        return true;
    }
}
