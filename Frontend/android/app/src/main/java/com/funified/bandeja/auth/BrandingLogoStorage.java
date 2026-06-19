package com.funified.bandeja.auth;

import android.content.Context;
import android.content.SharedPreferences;

public final class BrandingLogoStorage {
    private static final String PREFS = "bandeja_branding";
    private static final String KEY_LOGO = "splash_logo_key";

    private BrandingLogoStorage() {}

    public static void setLogoKey(Context context, String logoKey) {
        if (context == null) return;
        String safe = logoKey == null || logoKey.isEmpty() ? "padel" : logoKey;
        SharedPreferences prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_LOGO, safe).apply();
    }

    public static String getLogoKey(Context context) {
        if (context == null) return "padel";
        SharedPreferences prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String value = prefs.getString(KEY_LOGO, "padel");
        return value == null || value.isEmpty() ? "padel" : value;
    }
}
