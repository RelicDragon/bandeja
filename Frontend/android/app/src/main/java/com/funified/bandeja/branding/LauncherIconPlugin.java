package com.funified.bandeja.branding;

import android.content.ComponentName;
import android.content.pm.PackageManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Android launcher-icon switcher that only touches disposable launcher aliases.
 *
 * The community app-icon plugin also disables {@code MainActivity}. That is unsafe here because
 * MainActivity owns the Capacitor bridge and may have a system permission Activity above it.
 */
@CapacitorPlugin(name = "LauncherIcon")
public final class LauncherIconPlugin extends Plugin {
    private static final String DEFAULT_ALIAS = "tiger";
    private static final Set<String> ALIASES = new LinkedHashSet<>(
        Arrays.asList("tiger", "racket", "tennis", "pickleball", "badminton", "table_tennis", "squash")
    );

    @PluginMethod
    public void getName(PluginCall call) {
        PackageManager packageManager = getContext().getPackageManager();
        String packageName = getContext().getPackageName();
        String active = null;

        for (String alias : ALIASES) {
            ComponentName component = new ComponentName(packageName, packageName + "." + alias);
            int state = packageManager.getComponentEnabledSetting(component);
            if (state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED ||
                (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && DEFAULT_ALIAS.equals(alias))) {
                active = alias;
                break;
            }
        }

        JSObject result = new JSObject();
        result.put("value", active);
        call.resolve(result);
    }

    @PluginMethod
    public synchronized void change(PluginCall call) {
        String target = call.getString("name");
        if (target == null || !ALIASES.contains(target)) {
            call.reject("Unknown launcher icon alias");
            return;
        }

        PackageManager packageManager = getContext().getPackageManager();
        String packageName = getContext().getPackageName();
        packageManager.setComponentEnabledSetting(
            new ComponentName(packageName, packageName + "." + target),
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP
        );

        // Disable every other known alias, regardless of a stale caller-provided list. The real
        // MainActivity and LauncherActivity are deliberately never component-change targets.
        for (String alias : ALIASES) {
            if (target.equals(alias)) continue;
            packageManager.setComponentEnabledSetting(
                new ComponentName(packageName, packageName + "." + alias),
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP
            );
        }

        call.resolve();
    }
}
