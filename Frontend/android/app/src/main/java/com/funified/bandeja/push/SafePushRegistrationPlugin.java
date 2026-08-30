package com.funified.bandeja.push;

import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * Crash boundary around Firebase registration.
 *
 * Capacitor's stock PushNotifications.register() calls FirebaseMessaging.getInstance() before it
 * can reject the JavaScript call. If a release is ever misconfigured, that unchecked exception
 * escapes the plugin thread and Android terminates the process. Keep using the stock plugin for
 * permissions, listeners and notification delivery, but make registration itself fail closed.
 */
@CapacitorPlugin(name = "SafePushRegistration")
public final class SafePushRegistrationPlugin extends Plugin {
    private static final String CONFIGURATION_ERROR = "Firebase push configuration is unavailable";

    @PluginMethod
    public void register(PluginCall call) {
        try {
            FirebaseApp firebaseApp = initializeFirebase();
            if (firebaseApp == null) {
                call.reject(CONFIGURATION_ERROR);
                return;
            }

            PushNotificationsPlugin pushPlugin =
                PushNotificationsPlugin.getPushNotificationsInstance();
            if (pushPlugin == null) {
                call.reject("Push notifications plugin is unavailable");
                return;
            }

            FirebaseMessaging messaging = FirebaseMessaging.getInstance();
            messaging.setAutoInitEnabled(true);
            messaging.getToken().addOnCompleteListener(task -> {
                try {
                    if (!task.isSuccessful()) {
                        Exception exception = task.getException();
                        sendErrorSafely(
                            pushPlugin,
                            exception != null && exception.getLocalizedMessage() != null
                                ? exception.getLocalizedMessage()
                                : "Firebase token registration failed"
                        );
                        return;
                    }
                    String token = task.getResult();
                    if (token == null || token.trim().isEmpty()) {
                        sendErrorSafely(pushPlugin, "Firebase returned an empty registration token");
                        return;
                    }
                    pushPlugin.sendToken(token);
                } catch (RuntimeException callbackError) {
                    sendErrorSafely(pushPlugin, safeMessage(callbackError));
                }
            });
            call.resolve();
        } catch (RuntimeException registrationError) {
            call.reject(safeMessage(registrationError), registrationError);
        }
    }

    private FirebaseApp initializeFirebase() {
        try {
            return FirebaseApp.getInstance();
        } catch (IllegalStateException notInitialized) {
            return FirebaseApp.initializeApp(getContext());
        }
    }

    private static String safeMessage(RuntimeException error) {
        String message = error.getLocalizedMessage();
        return message == null || message.trim().isEmpty()
            ? "Firebase push registration failed safely"
            : message;
    }

    private static void sendErrorSafely(PushNotificationsPlugin pushPlugin, String message) {
        try {
            pushPlugin.sendError(message);
        } catch (RuntimeException ignored) {
            // Registration is auxiliary; listener delivery must never terminate the app process.
        }
    }
}
