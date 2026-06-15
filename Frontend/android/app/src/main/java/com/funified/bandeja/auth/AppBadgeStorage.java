package com.funified.bandeja.auth;

import android.content.Context;
import android.content.SharedPreferences;

public final class AppBadgeStorage {
    private static final String PREFS_NAME = "bandeja_app_badge";
    private static final String KEY_BADGE_COUNT = "badge_count";

    private AppBadgeStorage() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public static void setCount(Context context, int count) {
        int safeCount = Math.max(0, count);
        prefs(context).edit().putInt(KEY_BADGE_COUNT, safeCount).apply();
    }

    public static int getCount(Context context) {
        return Math.max(0, prefs(context).getInt(KEY_BADGE_COUNT, 0));
    }
}
