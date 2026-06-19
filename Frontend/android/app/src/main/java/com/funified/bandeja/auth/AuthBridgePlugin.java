package com.funified.bandeja.auth;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AuthBridge")
public class AuthBridgePlugin extends Plugin {

    @PluginMethod
    public void setToken(PluginCall call) {
        String token = call.getString("token");
        if (token == null || token.isEmpty()) {
            call.reject("Missing token");
            return;
        }
        SecureTokenStorage.setToken(getContext(), token);
        call.resolve();
    }

    @PluginMethod
    public void getToken(PluginCall call) {
        JSObject result = new JSObject();
        result.put("token", SecureTokenStorage.getToken(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void deleteToken(PluginCall call) {
        SecureTokenStorage.deleteToken(getContext());
        call.resolve();
    }

    @PluginMethod
    public void setRefreshToken(PluginCall call) {
        String token = call.getString("token");
        if (token == null || token.isEmpty()) {
            call.reject("Missing token");
            return;
        }
        SecureTokenStorage.setRefreshToken(getContext(), token);
        call.resolve();
    }

    @PluginMethod
    public void getRefreshToken(PluginCall call) {
        JSObject result = new JSObject();
        result.put("token", SecureTokenStorage.getRefreshToken(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void deleteRefreshToken(PluginCall call) {
        SecureTokenStorage.deleteRefreshToken(getContext());
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
}
