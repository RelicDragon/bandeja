package com.funified.bandeja.auth;

import android.content.Context;
import android.content.SharedPreferences;
import com.funified.bandeja.R;

public final class NativeApiConfig {
    private static final String PREFS_NAME = "bandeja_native_api_config";
    private static final String KEY_API_BASE_URL = "api_base_url";

    private NativeApiConfig() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public static void setApiBaseUrl(Context context, String apiBaseUrl) {
        if (apiBaseUrl == null || apiBaseUrl.trim().isEmpty()) {
            return;
        }
        String normalized = apiBaseUrl.trim().replaceAll("/+$", "");
        prefs(context).edit().putString(KEY_API_BASE_URL, normalized).apply();
    }

    public static String getApiBaseUrl(Context context) {
        String stored = prefs(context).getString(KEY_API_BASE_URL, null);
        if (stored != null && !stored.isEmpty()) {
            return stored;
        }
        return context.getString(R.string.api_base_url_default);
    }
}
