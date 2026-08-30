package com.funified.bandeja.push;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/**
 * Trampoline for notification content taps.
 *
 * Persists a lean payload, then starts a clean launcher Intent with no push
 * extras so MainActivity's singleTask root cannot be poisoned.
 */
public class NotificationOpenActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (savedInstanceState != null) {
            finish();
            return;
        }

        try {
            Intent src = getIntent();
            Bundle lean = src.getExtras() != null ? new Bundle(src.getExtras()) : new Bundle();
            String messageId = lean.getString(PushTapIntentFactory.EXTRA_GOOGLE_MESSAGE_ID);
            lean.remove(PushTapIntentFactory.EXTRA_GOOGLE_MESSAGE_ID);
            lean.remove(PushTapStore.EXTRA_PUSH_TAP_ID);

            PushTapStore.save(this, lean, messageId);

            Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (launch == null) {
                launch = new Intent(this, com.funified.bandeja.MainActivity.class);
                launch.setAction(Intent.ACTION_MAIN);
                launch.addCategory(Intent.CATEGORY_LAUNCHER);
            }
            launch.setFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK |
                Intent.FLAG_ACTIVITY_CLEAR_TOP |
                Intent.FLAG_ACTIVITY_SINGLE_TOP |
                Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED
            );
            // Critical: no google.message_id, JWTs, or tap ids on the task root.
            launch.replaceExtras((Bundle) null);

            startActivity(launch);
        } catch (RuntimeException ignored) {
            // Never leave a blank trampoline on screen if launch fails.
        }
        finish();
    }
}
