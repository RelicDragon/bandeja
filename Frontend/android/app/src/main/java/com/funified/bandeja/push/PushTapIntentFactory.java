package com.funified.bandeja.push;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import com.funified.bandeja.MainActivity;

public final class PushTapIntentFactory {
    private PushTapIntentFactory() {}

    public static Intent build(Context context, Bundle extras, String messageId) {
        Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (intent == null) {
            intent = new Intent(context, MainActivity.class);
        }
        intent.setAction(Intent.ACTION_MAIN);
        intent.addCategory(Intent.CATEGORY_LAUNCHER);
        intent.setFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK |
            Intent.FLAG_ACTIVITY_CLEAR_TOP |
            Intent.FLAG_ACTIVITY_SINGLE_TOP
        );
        if (extras != null) {
            intent.putExtras(extras);
        }
        if (messageId != null) {
            intent.putExtra("google.message_id", messageId);
        }
        return intent;
    }
}
