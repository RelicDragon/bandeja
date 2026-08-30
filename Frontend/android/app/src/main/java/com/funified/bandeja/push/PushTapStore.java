package com.funified.bandeja.push;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import java.util.Iterator;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Holds one pending notification-tap payload off the Activity Intent.
 *
 * Memory-first for same-process trampoline → MainActivity; SharedPreferences
 * with commit() as backup if the process is killed mid-hop (rare).
 */
public final class PushTapStore {
    /** Legacy intent extra; stripped on sight and no longer written by new taps. */
    public static final String EXTRA_PUSH_TAP_ID = "bandeja.pushTapId";

    private static final String PREFS = "bandeja_push_tap";
    private static final String KEY_PENDING = "pending_payload";
    private static final String JSON_MESSAGE_ID = "_messageId";

    private static Bundle memoryPayload;

    private PushTapStore() {}

    public static synchronized void save(Context context, Bundle leanExtras, String messageId) {
        Bundle copy = new Bundle();
        if (messageId != null) {
            copy.putString(PushTapIntentFactory.EXTRA_GOOGLE_MESSAGE_ID, messageId);
        }
        if (leanExtras != null) {
            for (String key : leanExtras.keySet()) {
                if (key == null || PushTapIntentFactory.EXTRA_GOOGLE_MESSAGE_ID.equals(key)) {
                    continue;
                }
                Object value = leanExtras.get(key);
                if (value != null) {
                    copy.putString(key, String.valueOf(value));
                }
            }
        }
        memoryPayload = copy;
        String encoded = encode(copy);
        // commit(): trampoline starts MainActivity immediately; apply() can lose the read.
        prefs(context).edit().putString(KEY_PENDING, encoded).commit();
    }

    public static synchronized Bundle takePending(Context context) {
        Bundle fromMemory = memoryPayload;
        memoryPayload = null;

        SharedPreferences preferences = prefs(context);
        String raw = preferences.getString(KEY_PENDING, null);
        preferences.edit().remove(KEY_PENDING).commit();

        if (fromMemory != null && !fromMemory.isEmpty()) {
            return fromMemory;
        }
        if (raw == null || raw.isEmpty()) {
            return null;
        }
        return decode(raw);
    }

    public static synchronized boolean hasPending(Context context) {
        if (memoryPayload != null && !memoryPayload.isEmpty()) {
            return true;
        }
        String raw = prefs(context).getString(KEY_PENDING, null);
        return raw != null && !raw.isEmpty();
    }

    static String encode(Bundle extras) {
        JSONObject json = new JSONObject();
        if (extras == null) {
            return json.toString();
        }
        try {
            for (String key : extras.keySet()) {
                if (key == null) {
                    continue;
                }
                String value = extras.getString(key);
                if (value == null) {
                    continue;
                }
                if (PushTapIntentFactory.EXTRA_GOOGLE_MESSAGE_ID.equals(key)) {
                    json.put(JSON_MESSAGE_ID, value);
                } else {
                    json.put(key, value);
                }
            }
        } catch (JSONException ignored) {
            // empty
        }
        return json.toString();
    }

    static Bundle decode(String raw) {
        try {
            JSONObject json = new JSONObject(raw);
            Bundle extras = new Bundle();
            Iterator<String> keys = json.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                String value = json.optString(key, null);
                if (value == null) {
                    continue;
                }
                if (JSON_MESSAGE_ID.equals(key)) {
                    extras.putString(PushTapIntentFactory.EXTRA_GOOGLE_MESSAGE_ID, value);
                } else {
                    extras.putString(key, value);
                }
            }
            return extras;
        } catch (JSONException ignored) {
            return null;
        }
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
