package com.funified.bandeja;

import android.app.Application;
import androidx.annotation.NonNull;
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.LifecycleOwner;
import androidx.lifecycle.ProcessLifecycleOwner;
import com.funified.bandeja.push.AppForegroundState;

public class BandejaApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        ProcessLifecycleOwner.get().getLifecycle().addObserver(new DefaultLifecycleObserver() {
            @Override
            public void onStart(@NonNull LifecycleOwner owner) {
                AppForegroundState.setForeground(true);
            }

            @Override
            public void onStop(@NonNull LifecycleOwner owner) {
                AppForegroundState.setForeground(false);
            }
        });
    }
}
