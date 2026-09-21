package com.funified.bandeja.push;

import java.util.Map;

/**
 * PRD 346 — the game reminder that carries the two attendance shade actions.
 *
 * <p>Confirmation is a courtesy signal: the actions post an answer and nothing
 * else. They never join, leave, or reorder anybody.
 */
public final class AttendancePushData {
    private static final String TYPE = "GAME_REMINDER";

    public final String title;
    public final String body;
    public final String gameId;
    public final String confirmActionToken;
    public final String unsureActionToken;
    public final String confirmActionTitle;
    public final String unsureActionTitle;
    public final String confirmedAck;
    public final String unsureAck;

    private AttendancePushData(
        String title,
        String body,
        String gameId,
        String confirmActionToken,
        String unsureActionToken,
        String confirmActionTitle,
        String unsureActionTitle,
        String confirmedAck,
        String unsureAck
    ) {
        this.title = title;
        this.body = body;
        this.gameId = gameId;
        this.confirmActionToken = confirmActionToken;
        this.unsureActionToken = unsureActionToken;
        this.confirmActionTitle = confirmActionTitle;
        this.unsureActionTitle = unsureActionTitle;
        this.confirmedAck = confirmedAck;
        this.unsureAck = unsureAck;
    }

    /**
     * A reminder only offers the actions when the backend signed both tokens.
     * A reminder without them stays an ordinary reminder.
     */
    public static boolean hasAttendanceActions(Map<String, String> data) {
        if (data == null || data.isEmpty()) {
            return false;
        }
        return TYPE.equals(trim(data.get("type")))
            && trim(data.get("gameId")) != null
            && trim(data.get("attendanceActionToken")) != null
            && trim(data.get("attendanceUnsureActionToken")) != null;
    }

    public static AttendancePushData fromMap(Map<String, String> data) {
        if (!hasAttendanceActions(data)) {
            return null;
        }
        return new AttendancePushData(
            trim(data.get("title")),
            trim(data.get("body")),
            trim(data.get("gameId")),
            trim(data.get("attendanceActionToken")),
            trim(data.get("attendanceUnsureActionToken")),
            trim(data.get("confirmActionTitle")),
            trim(data.get("unsureActionTitle")),
            trim(data.get("attendanceConfirmedAck")),
            trim(data.get("attendanceUnsureAck"))
        );
    }

    /**
     * Deliberately the same key {@link DataPushNotificationHelper#notificationId}
     * builds for a reminder, so the 2 h reminder replaces the 24 h one instead of
     * stacking a second card in the shade.
     */
    public int notificationId() {
        return (TYPE + ":" + gameId).hashCode() & 0x7fffffff;
    }

    private static String trim(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
