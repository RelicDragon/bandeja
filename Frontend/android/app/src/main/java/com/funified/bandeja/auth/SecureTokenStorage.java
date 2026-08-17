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

    public static boolean setToken(Context context, String token) {
        try {
            return prefs(context).edit().putString(KEY_ACCESS_TOKEN, token).commit();
        } catch (Exception ignored) {
            return false;
        }
    }

    public static String getToken(Context context) {
        try {
            return getTokenStrict(context);
        } catch (Exception ignored) {
            // Background notification actions cannot surface storage errors to JavaScript.
            return null;
        }
    }

    public static String getTokenStrict(Context context) throws Exception {
        return prefs(context).getString(KEY_ACCESS_TOKEN, null);
    }

    public static boolean deleteToken(Context context) {
        try {
            return prefs(context).edit().remove(KEY_ACCESS_TOKEN).commit();
        } catch (Exception ignored) {
            return false;
        }
    }

    public static boolean deleteSession(Context context) {
        try {
            return prefs(context).edit()
                .remove(KEY_ACCESS_TOKEN)
                .remove(KEY_REFRESH_TOKEN)
                .commit();
        } catch (Exception ignored) {
            return false;
        }
    }

    public static boolean setRefreshToken(Context context, String token) {
        try {
            return prefs(context).edit().putString(KEY_REFRESH_TOKEN, token).commit();
        } catch (Exception ignored) {
            return false;
        }
    }

    public static String getRefreshToken(Context context) throws Exception {
        return prefs(context).getString(KEY_REFRESH_TOKEN, null);
    }

    public static boolean deleteRefreshToken(Context context) {
        try {
            return prefs(context).edit().remove(KEY_REFRESH_TOKEN).commit();
        } catch (Exception ignored) {
            return false;
        }
    }
}
