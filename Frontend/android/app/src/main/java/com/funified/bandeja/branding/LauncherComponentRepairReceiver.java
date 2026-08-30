package com.funified.bandeja.branding;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Restores launcher entry points immediately after Android replaces an older app version. */
public final class LauncherComponentRepairReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        LauncherComponentRepair.repair(context);
    }
}
