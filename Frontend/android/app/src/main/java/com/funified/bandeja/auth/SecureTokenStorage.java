package com.funified.bandeja.auth;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

public final class SecureTokenStorage {
    private static final String PREFS_NAME = "bandeja_auth_secure";
    private static final String KEY_ACCESS_TOKEN = "access_token";
    private static final String KEY_REFRESH_TOKEN = "refresh_token";

    private SecureTokenStorage() {}

    private static SharedPreferences prefs(Context context) throws Exception {
        MasterKey masterKey = new MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build();

        return EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        );
    }

    public static void setToken(Context context, String token) {
        try {
            prefs(context).edit().putString(KEY_ACCESS_TOKEN, token).apply();
        } catch (Exception ignored) {
            // Encrypted prefs unavailable — token stays unavailable to native reply path
        }
    }

    public static String getToken(Context context) {
        try {
            return prefs(context).getString(KEY_ACCESS_TOKEN, null);
        } catch (Exception ignored) {
            return null;
        }
    }

    public static void deleteToken(Context context) {
        try {
            prefs(context).edit()
                .remove(KEY_ACCESS_TOKEN)
                .remove(KEY_REFRESH_TOKEN)
                .apply();
        } catch (Exception ignored) {
            // ignore
        }
    }

    public static void setRefreshToken(Context context, String token) {
        try {
            prefs(context).edit().putString(KEY_REFRESH_TOKEN, token).apply();
        } catch (Exception ignored) {
            // ignore
        }
    }

    public static String getRefreshToken(Context context) {
        try {
            return prefs(context).getString(KEY_REFRESH_TOKEN, null);
        } catch (Exception ignored) {
            return null;
        }
    }

    public static void deleteRefreshToken(Context context) {
        try {
            prefs(context).edit().remove(KEY_REFRESH_TOKEN).apply();
        } catch (Exception ignored) {
            // ignore
        }
    }
}
