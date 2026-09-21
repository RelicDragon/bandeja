package com.funified.bandeja.push;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.HashMap;
import java.util.Map;
import org.junit.Test;

public class AttendancePushDataTest {
    private static Map<String, String> reminder() {
        Map<String, String> data = new HashMap<>();
        data.put("type", "GAME_REMINDER");
        data.put("title", "Tomorrow 19:00");
        data.put("body", "Padel Centar, court 3");
        data.put("gameId", "game-1");
        data.put("attendanceActionToken", "confirm-token");
        data.put("attendanceUnsureActionToken", "unsure-token");
        data.put("confirmActionTitle", "I'm coming");
        data.put("unsureActionTitle", "Not sure yet");
        data.put("attendanceConfirmedAck", "Seat confirmed 👍");
        data.put("attendanceUnsureAck", "Noted. You can confirm later.");
        return data;
    }

    @Test
    public void parsesAReminderCarryingBothTokens() {
        AttendancePushData parsed = AttendancePushData.fromMap(reminder());
        assertNotNull(parsed);
        assertEquals("game-1", parsed.gameId);
        assertEquals("confirm-token", parsed.confirmActionToken);
        assertEquals("unsure-token", parsed.unsureActionToken);
        assertEquals("I'm coming", parsed.confirmActionTitle);
        assertEquals("Seat confirmed 👍", parsed.confirmedAck);
        assertEquals("Noted. You can confirm later.", parsed.unsureAck);
    }

    @Test
    public void ignoresAPlainReminder() {
        Map<String, String> data = reminder();
        data.remove("attendanceActionToken");
        data.remove("attendanceUnsureActionToken");
        assertFalse(AttendancePushData.hasAttendanceActions(data));
        assertNull(AttendancePushData.fromMap(data));
    }

    @Test
    public void refusesAHalfSignedReminder() {
        Map<String, String> data = reminder();
        data.remove("attendanceUnsureActionToken");
        assertFalse(AttendancePushData.hasAttendanceActions(data));
    }

    @Test
    public void refusesBlankTokensAndOtherTypes() {
        Map<String, String> blank = reminder();
        blank.put("attendanceActionToken", "   ");
        assertFalse(AttendancePushData.hasAttendanceActions(blank));

        Map<String, String> otherType = reminder();
        otherType.put("type", "GAME_SYSTEM_MESSAGE");
        assertFalse(AttendancePushData.hasAttendanceActions(otherType));

        Map<String, String> noGame = reminder();
        noGame.remove("gameId");
        assertFalse(AttendancePushData.hasAttendanceActions(noGame));
    }

    @Test
    public void reusesTheReminderNotificationIdSoThe2hMessageReplacesThe24h() {
        AttendancePushData parsed = AttendancePushData.fromMap(reminder());
        assertNotNull(parsed);
        assertEquals(DataPushNotificationHelper.notificationId(reminder()), parsed.notificationId());
    }

    @Test
    public void keepsSignedTokensOutOfTapExtras() {
        Map<String, String> extras = DataPushNotificationHelper.tapExtrasMap(reminder());
        assertFalse(extras.containsKey("attendanceActionToken"));
        assertFalse(extras.containsKey("attendanceUnsureActionToken"));
        assertEquals("game-1", extras.get("gameId"));
    }

    /**
     * `nativeHandler` alone must not swallow the reminder: when the payload
     * cannot carry the two actions, `AttendanceNotificationHelper.show` returns
     * false and `ChatReplyMessagingService` falls through to the ordinary
     * reminder, which `DataPushNotificationHelper` can still render.
     */
    @Test
    public void anIncompletePayloadFallsBackToAnOrdinaryReminder() {
        Map<String, String> data = reminder();
        data.put("nativeHandler", "attendance_actions");
        data.remove("attendanceUnsureActionToken");

        assertNull(AttendancePushData.fromMap(data));
        assertTrue(DataPushNotificationHelper.canShow(data));
    }

    @Test
    public void treatsAttendanceTokensAsLauncherPoison() {
        assertTrue(PushIntentSanitizer.hasPushPoisonKeys(reminder().keySet()));
    }
}
