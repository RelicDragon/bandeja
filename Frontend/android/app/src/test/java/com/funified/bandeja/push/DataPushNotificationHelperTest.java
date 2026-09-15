package com.funified.bandeja.push;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.HashMap;
import java.util.Map;
import org.junit.Test;

public class DataPushNotificationHelperTest {
    @Test
    public void showsNewGameWhenTypeAndBodyPresent() {
        Map<String, String> data = new HashMap<>();
        data.put("type", "NEW_GAME");
        data.put("title", "New game created");
        data.put("body", "Tue 18:00");
        data.put("gameId", "game-1");
        assertTrue(DataPushNotificationHelper.canShow(data));
    }

    @Test
    public void rejectsMissingType() {
        Map<String, String> data = new HashMap<>();
        data.put("title", "New game created");
        data.put("gameId", "game-1");
        assertFalse(DataPushNotificationHelper.canShow(data));
    }

    @Test
    public void tapExtrasKeepGameIdAndDropTokens() {
        Map<String, String> data = new HashMap<>();
        data.put("type", "NEW_GAME");
        data.put("gameId", "game-1");
        data.put("title", "New game created");
        data.put("replyToken", "secret");
        data.put("google.message_id", "mid-1");
        Map<String, String> extras = DataPushNotificationHelper.tapExtrasMap(data);
        assertEquals("NEW_GAME", extras.get("type"));
        assertEquals("game-1", extras.get("gameId"));
        assertFalse(extras.containsKey("replyToken"));
        assertFalse(extras.containsKey("google.message_id"));
    }

    @Test
    public void notificationIdIsStablePerGame() {
        Map<String, String> first = new HashMap<>();
        first.put("type", "NEW_GAME");
        first.put("gameId", "game-1");
        Map<String, String> second = new HashMap<>();
        second.put("type", "NEW_GAME");
        second.put("gameId", "game-1");
        second.put("title", "ignored");
        assertEquals(
            DataPushNotificationHelper.notificationId(first),
            DataPushNotificationHelper.notificationId(second)
        );
    }
}
