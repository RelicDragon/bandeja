package com.funified.bandeja.auth;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AuthBridge")
public class AuthBridgePlugin extends Plugin {
    public static int appBackgroundColor(Context context) {
        SharedPreferences prefs = context.getSharedPreferences("appAppearance", Context.MODE_PRIVATE);
        String preference = prefs.getString("appearance", "light");
        boolean premium = prefs.getBoolean("premium", false);
        boolean systemDark = (context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        boolean dark = "dark".equals(preference) || ("system".equals(preference) && systemDark);
        return Color.parseColor(premium ? (dark ? "#141411" : "#faf9f6") : (dark ? "#111827" : "#f9fafb"));
    }

    @PluginMethod
    public void setAppAppearance(PluginCall call) {
        String appearance = call.getString("appearance");
        if (!"light".equals(appearance) && !"dark".equals(appearance) && !"system".equals(appearance)) {
            call.reject("Invalid appearance");
            return;
        }
        boolean premium = Boolean.TRUE.equals(call.getBoolean("premium", false));
        getActivity().runOnUiThread(() -> {
            getContext().getSharedPreferences("appAppearance", Context.MODE_PRIVATE).edit()
                .putString("appearance", appearance).putBoolean("premium", premium).apply();
            int color = appBackgroundColor(getContext());
            getBridge().getWebView().setBackgroundColor(color);
            getActivity().getWindow().setBackgroundDrawable(new ColorDrawable(color));
            call.resolve();
        });
    }

    private static volatile boolean appShellReady = false;

    public static boolean isAppShellReady() {
        return appShellReady;
    }

    @PluginMethod
    public void setToken(PluginCall call) {
        String token = call.getString("token");
        if (token == null || token.isEmpty()) {
            call.reject("Missing token");
            return;
        }
        if (!SecureTokenStorage.setToken(getContext(), token)) {
            call.reject("Secure token storage unavailable");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void getToken(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("token", SecureTokenStorage.getTokenStrict(getContext()));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Secure token storage unavailable", error);
        }
    }

    @PluginMethod
    public void deleteToken(PluginCall call) {
        if (!SecureTokenStorage.deleteToken(getContext())) {
            call.reject("Secure token storage unavailable");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void deleteSession(PluginCall call) {
        if (!SecureTokenStorage.deleteSession(getContext())) {
            call.reject("Secure token storage unavailable");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void setRefreshToken(PluginCall call) {
        String token = call.getString("token");
        if (token == null || token.isEmpty()) {
            call.reject("Missing token");
            return;
        }
        if (!SecureTokenStorage.setRefreshToken(getContext(), token)) {
            call.reject("Secure token storage unavailable");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void getRefreshToken(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("token", SecureTokenStorage.getRefreshToken(getContext()));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Secure token storage unavailable", error);
        }
    }

    @PluginMethod
    public void deleteRefreshToken(PluginCall call) {
        if (!SecureTokenStorage.deleteRefreshToken(getContext())) {
            call.reject("Secure token storage unavailable");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void setApiBaseUrl(PluginCall call) {
        String apiBaseUrl = call.getString("apiBaseUrl");
        if (apiBaseUrl == null || apiBaseUrl.isEmpty()) {
            call.reject("Missing apiBaseUrl");
            return;
        }
        NativeApiConfig.setApiBaseUrl(getContext(), apiBaseUrl);
        call.resolve();
    }

    @PluginMethod
    public void syncWatchPreferences(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void setAppIconBadgeCount(PluginCall call) {
        int count = call.getInt("count", 0);
        AppBadgeStorage.setCount(getContext(), count);
        call.resolve();
    }

    @PluginMethod
    public void getAppIconBadgeCount(PluginCall call) {
        JSObject result = new JSObject();
        result.put("count", AppBadgeStorage.getCount(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void syncBrandingLogo(PluginCall call) {
        String logoKey = call.getString("logoKey");
        BrandingLogoStorage.setLogoKey(getContext(), logoKey == null || logoKey.isEmpty() ? "padel" : logoKey);
        call.resolve();
    }

    @PluginMethod
    public void notifyAppShellReady(PluginCall call) {
        appShellReady = true;
        call.resolve();
    }
}
