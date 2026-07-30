package com.funified.bandeja.push;

import java.util.Map;

public final class PlayIntentPushData {
    private static final String TYPE = "FOLLOWED_USER_PLAY_INTENT";

    public final String type;
    public final String title;
    public final String body;
    public final String playIntentId;
    public final String playTooActionTitle;

    private PlayIntentPushData(
        String title,
        String body,
        String playIntentId,
        String playTooActionTitle
    ) {
        this.type = TYPE;
        this.title = title;
        this.body = body;
        this.playIntentId = playIntentId;
        this.playTooActionTitle = playTooActionTitle;
    }

    public static boolean isPlayIntent(Map<String, String> data) {
        return data != null
            && TYPE.equals(trim(data.get("type")))
            && trim(data.get("playIntentId")) != null;
    }

    public static PlayIntentPushData fromMap(Map<String, String> data) {
        if (!isPlayIntent(data)) {
            return null;
        }
        return new PlayIntentPushData(
            trim(data.get("title")),
            trim(data.get("body")),
            trim(data.get("playIntentId")),
            trim(data.get("playTooActionTitle"))
        );
    }

    public int notificationId() {
        return (type + ":" + playIntentId).hashCode() & 0x7fffffff;
    }

    public String messageId() {
        return type + ":" + playIntentId;
    }

    private static String trim(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
