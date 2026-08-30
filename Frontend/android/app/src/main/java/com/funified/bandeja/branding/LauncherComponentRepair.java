package com.funified.bandeja.branding;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;
import com.funified.bandeja.LauncherActivity;
import com.funified.bandeja.MainActivity;
import java.util.Arrays;
import java.util.List;

/** Repairs component overrides persisted by older launcher-icon implementations and app updates. */
public final class LauncherComponentRepair {
    private static final String DEFAULT_ALIAS = "tiger";
    private static final List<String> ALIASES = Arrays.asList(
        "tiger", "racket", "tennis", "pickleball", "badminton", "table_tennis", "squash"
    );

    private LauncherComponentRepair() {}

    public static synchronized void repair(Context context) {
        try {
            PackageManager packageManager = context.getPackageManager();
            String packageName = context.getPackageName();

            enable(packageManager, new ComponentName(context, MainActivity.class));
            enable(packageManager, new ComponentName(context, LauncherActivity.class));

            if (!hasEnabledAlias(packageManager, packageName)) {
                enable(
                    packageManager,
                    new ComponentName(packageName, packageName + "." + DEFAULT_ALIAS)
                );
            }
        } catch (RuntimeException ignored) {
            // A best-effort repair must never become a new application-startup failure.
        }
    }

    private static boolean hasEnabledAlias(PackageManager packageManager, String packageName) {
        for (String alias : ALIASES) {
            int state = packageManager.getComponentEnabledSetting(
                new ComponentName(packageName, packageName + "." + alias)
            );
            if (state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED ||
                (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && DEFAULT_ALIAS.equals(alias))) {
                return true;
            }
        }
        return false;
    }

    private static void enable(PackageManager packageManager, ComponentName component) {
        if (packageManager.getComponentEnabledSetting(component) ==
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED) {
            return;
        }
        packageManager.setComponentEnabledSetting(
            component,
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP
        );
    }
}
