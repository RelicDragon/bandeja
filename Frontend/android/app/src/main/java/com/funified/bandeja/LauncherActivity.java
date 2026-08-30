package com.funified.bandeja;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/**
 * Stable launcher trampoline for alternate app-icon aliases.
 *
 * Mutable aliases should never target the long-lived Capacitor bridge directly. Android still
 * removes a task when the alias in its base launch intent is disabled, so JavaScript additionally
 * defers alias changes until a safe background transition.
 */
public final class LauncherActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Intent source = getIntent();
        Intent destination = new Intent(this, MainActivity.class);
        if (source != null) {
            destination.setAction(source.getAction());
            destination.setData(source.getData());
            destination.setClipData(source.getClipData());
            if (source.getExtras() != null) {
                destination.putExtras(source.getExtras());
            }
        }

        startActivity(destination);
        finish();
    }
}
