package com.funified.bandeja.auth;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.json.JSONObject;

/**
 * Background refresh for notification actions (invite accept/decline, chat reply).
 * Uses the same native-v1 request-id scheme as the JS / Watch clients.
 */
public final class NativeAuthRefresh {
    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 20_000;
    private static final int MAX_BUSY_RETRIES = 2;
    private static final Object LOCK = new Object();

    private NativeAuthRefresh() {}

    public static String refreshAccessToken(Context context) {
        synchronized (LOCK) {
            try {
                return refreshAccessTokenUnlocked(context, 0);
            } catch (Exception ignored) {
                return null;
            }
        }
    }

    private static String refreshAccessTokenUnlocked(Context context, int busyAttempt)
        throws Exception {
        String refreshToken = SecureTokenStorage.getRefreshToken(context);
        if (refreshToken == null || refreshToken.isEmpty()) {
            return null;
        }

        String apiBase = NativeApiConfig.getApiBaseUrl(context);
        HttpURLConnection connection =
            (HttpURLConnection) new URL(apiBase + "/auth/refresh").openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("X-Client-Platform", "android");
        connection.setRequestProperty("X-Client-Version", appVersion(context));
        connection.setRequestProperty("X-Refresh-Request-Id", nativeRefreshRequestId(refreshToken));

        JSONObject body = new JSONObject();
        body.put("refreshToken", refreshToken);
        byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
        connection.setFixedLengthStreamingMode(payload.length);
        OutputStream outputStream = connection.getOutputStream();
        outputStream.write(payload);
        outputStream.flush();
        outputStream.close();

        int statusCode = connection.getResponseCode();
        InputStream stream =
            statusCode >= 400 ? connection.getErrorStream() : connection.getInputStream();
        String responseBody = readStream(stream);
        connection.disconnect();

        if (
            (statusCode == 408 || statusCode == 429 || statusCode == 503)
                && busyAttempt < MAX_BUSY_RETRIES
        ) {
            Thread.sleep(180L * (busyAttempt + 1));
            return refreshAccessTokenUnlocked(context, busyAttempt + 1);
        }
        if (statusCode < 200 || statusCode >= 300) {
            return null;
        }

        JSONObject json = new JSONObject(responseBody);
        JSONObject data = json.optJSONObject("data");
        if (data == null) {
            return null;
        }
        String access = data.optString("token", "");
        String nextRefresh = data.optString("refreshToken", "");
        if (access.isEmpty()) {
            return null;
        }
        if (!nextRefresh.isEmpty() && !SecureTokenStorage.setRefreshToken(context, nextRefresh)) {
            return null;
        }
        if (!SecureTokenStorage.setToken(context, access)) {
            return null;
        }
        return access;
    }

    private static String nativeRefreshRequestId(String refreshToken) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] hash =
            digest.digest(
                ("bandeja-refresh-request-v1:" + refreshToken).getBytes(StandardCharsets.UTF_8)
            );
        StringBuilder hex = new StringBuilder(hash.length * 2);
        for (byte b : hash) {
            hex.append(String.format("%02x", b));
        }
        return "native-v1-" + hex;
    }

    private static String appVersion(Context context) {
        try {
            PackageInfo info =
                context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            return info.versionName != null ? info.versionName : "1.0.0";
        } catch (PackageManager.NameNotFoundException ignored) {
            return "1.0.0";
        }
    }

    private static String readStream(InputStream stream) {
        if (stream == null) {
            return "";
        }
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream))) {
            StringBuilder builder = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
            return builder.toString();
        } catch (Exception ignored) {
            return "";
        }
    }
}
