package com.funified.bandeja.push;

import android.os.Bundle;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Delivers trampoline-stored notification taps to JS without putting
 * google.message_id on MainActivity's Intent (which Cap would re-fire forever).
 */
@CapacitorPlugin(name = "PushTapBridge")
public class PushTapBridgePlugin extends Plugin {
    /**
     * Publish any stored tap to JS. Uses retainUntilConsumed so cold-start
     * events survive until push listeners register.
     */
    public void publishPendingTapIfAny() {
        if (getContext() == null) {
            return;
        }
        if (!PushTapStore.hasPending(getContext())) {
            return;
        }
        Bundle extras = PushTapStore.takePending(getContext());
        JSObject action = toActionJson(extras);
        if (action == null) {
            return;
        }
        notifyListeners("pendingPushTap", action, true);
    }

    @PluginMethod
    public void consumePendingTap(PluginCall call) {
        Bundle extras = PushTapStore.takePending(getContext());
        JSObject action = toActionJson(extras);
        if (action == null) {
            JSObject empty = new JSObject();
            empty.put("pending", false);
            call.resolve(empty);
            return;
        }
        call.resolve(action);
    }

    private static JSObject toActionJson(Bundle extras) {
        if (extras == null || extras.isEmpty()) {
            return null;
        }
        JSObject notificationJson = new JSObject();
        JSObject dataObject = new JSObject();
        for (String key : extras.keySet()) {
            if (key == null) {
                continue;
            }
            String value = extras.getString(key);
            if (PushTapIntentFactory.EXTRA_GOOGLE_MESSAGE_ID.equals(key)) {
                notificationJson.put("id", value);
            } else if (value != null) {
                dataObject.put(key, value);
            }
        }
        if (!notificationJson.has("id")) {
            notificationJson.put("id", "bandeja-push-tap");
        }
        notificationJson.put("data", dataObject);

        JSObject result = new JSObject();
        result.put("pending", true);
        result.put("actionId", "tap");
        result.put("notification", notificationJson);
        return result;
    }
}
