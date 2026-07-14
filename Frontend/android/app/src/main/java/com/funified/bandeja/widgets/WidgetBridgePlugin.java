package com.funified.bandeja.widgets;

import android.content.Context;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {
    @PluginMethod
    public void syncNextGames(PluginCall call) {
        try {
            Context context = getContext();
            if (context == null) {
                call.reject("Missing context");
                return;
            }
            JSONObject data = call.getData();
            if (data == null) {
                call.reject("Missing next-games envelope");
                return;
            }
            if (!data.has("isAuthenticated") || !data.has("language") || !data.has("games")) {
                call.reject("Invalid next-games envelope");
                return;
            }
            if (!NextGamesEnvelopeStorage.writeFromJson(context, data.toString())) {
                call.reject("Failed to persist next-games envelope");
                return;
            }
            NextGameWidgetUpdater.requestUpdate(context);
            DynamicGameShortcuts.syncFromEnvelope(context);
            call.resolve();
        } catch (Exception error) {
            call.reject("Invalid next-games envelope", error);
        }
    }

    @PluginMethod
    public void clearNextGames(PluginCall call) {
        Context context = getContext();
        if (context == null) {
            call.reject("Missing context");
            return;
        }
        if (!NextGamesEnvelopeStorage.clear(context)) {
            call.reject("Failed to clear next-games envelope");
            return;
        }
        NextGameWidgetUpdater.requestUpdate(context);
        DynamicGameShortcuts.syncFromEnvelope(context);
        call.resolve();
    }
}
