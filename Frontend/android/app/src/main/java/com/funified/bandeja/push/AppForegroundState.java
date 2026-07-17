package com.funified.bandeja.push;

/** Process-local flag set from {@link com.funified.bandeja.MainActivity} resume/pause. */
public final class AppForegroundState {
    private static volatile boolean foreground;

    private AppForegroundState() {}

    public static void setForeground(boolean value) {
        foreground = value;
    }

    public static boolean isForeground() {
        return foreground;
    }
}
