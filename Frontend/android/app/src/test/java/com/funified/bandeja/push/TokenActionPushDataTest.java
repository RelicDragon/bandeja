package com.funified.bandeja.push;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.HashMap;
import java.util.Map;
import org.junit.Test;

/** PRD 345 / 357 — the generic signed-shade-action payload. */
public class TokenActionPushDataTest {
    private static Map<String, String> seriesPrompt() {
        Map<String, String> data = new HashMap<>();
        data.put("type", "GAME_SERIES_NEXT_PROMPT");
        data.put("title", "Same time next week?");
        data.put("body", "Tue 1 Oct 19:00 at Padel Centar");
        data.put("gameId", "next-game");
        data.put("sourceGameId", "finished-game");
        data.put("seriesId", "series-1");
        data.put("acceptActionToken", "accept-token");
        data.put("declineActionToken", "decline-token");
        data.put("acceptActionTitle", "I'm in");
        data.put("declineActionTitle", "Not this time");
        data.put("seriesAcceptAck", "Seat kept");
        data.put("seriesDeclineAck", "Okay — your seat opens to others");
        return data;
    }

    private static Map<String, String> organizerWeatherAlert() {
        Map<String, String> data = new HashMap<>();
        data.put("type", "GAME_WEATHER_ALERT");
        data.put("title", "Rain likely for tomorrow's game");
        data.put("body", "70 % chance of rain at 19:00");
        data.put("gameId", "game-1");
        data.put("weatherDeepLink", "/games/game-1?section=weather&action=moveIndoor");
        data.put("weatherKeepActionToken", "keep-token");
        data.put("keepActionTitle", "Keep as planned");
        data.put("moveIndoorActionTitle", "Move indoor");
        data.put("weatherKeptAck", "Playing rain or shine");
        return data;
    }

    @Test
    public void parsesBothSeriesAnswers() {
        TokenActionPushData parsed = TokenActionPushData.fromMap(seriesPrompt());
        assertNotNull(parsed);
        assertEquals("next-game", parsed.gameId);
        assertEquals(2, parsed.actions.size());
        assertEquals("accept", parsed.actions.get(0).id);
        assertEquals("I'm in", parsed.actions.get(0).title);
        assertEquals("accept-token", parsed.actions.get(0).actionToken);
        assertEquals("Seat kept", parsed.actions.get(0).ack);
        assertFalse(parsed.actions.get(0).isForeground());
        assertEquals("decline", parsed.actions.get(1).id);
    }

    @Test
    public void refusesASeriesPromptWithNoTokens() {
        Map<String, String> data = seriesPrompt();
        data.remove("acceptActionToken");
        data.remove("declineActionToken");
        assertFalse(TokenActionPushData.hasTokenActions(data));
        assertNull(TokenActionPushData.fromMap(data));
    }

    /**
     * A half-signed prompt still shows the button it can sign — unlike the
     * attendance pair, the two series answers are independent.
     */
    @Test
    public void keepsTheSignedHalfOfAPartialSeriesPrompt() {
        Map<String, String> data = seriesPrompt();
        data.remove("declineActionToken");
        TokenActionPushData parsed = TokenActionPushData.fromMap(data);
        assertNotNull(parsed);
        assertEquals(1, parsed.actions.size());
        assertEquals("accept", parsed.actions.get(0).id);
    }

    @Test
    public void splitsTheOrganizerWeatherAlertIntoAForegroundAndATokenButton() {
        TokenActionPushData parsed = TokenActionPushData.fromMap(organizerWeatherAlert());
        assertNotNull(parsed);
        assertEquals(2, parsed.actions.size());
        assertEquals("moveIndoor", parsed.actions.get(0).id);
        assertTrue(parsed.actions.get(0).isForeground());
        assertNull(parsed.actions.get(0).actionToken);
        assertEquals("keep", parsed.actions.get(1).id);
        assertEquals("keep-token", parsed.actions.get(1).actionToken);
    }

    @Test
    public void rendersTheParticipantWeatherAlertWithOnlyTheForecastButton() {
        Map<String, String> data = organizerWeatherAlert();
        data.remove("weatherKeepActionToken");
        data.remove("keepActionTitle");
        data.remove("moveIndoorActionTitle");
        data.put("forecastActionTitle", "Forecast");

        TokenActionPushData parsed = TokenActionPushData.fromMap(data);
        assertNotNull(parsed);
        assertEquals(1, parsed.actions.size());
        assertEquals("forecast", parsed.actions.get(0).id);
        assertTrue(parsed.actions.get(0).isForeground());
    }

    @Test
    public void ignoresUnrelatedPushTypes() {
        Map<String, String> data = seriesPrompt();
        data.put("type", "GAME_SYSTEM_MESSAGE");
        assertFalse(TokenActionPushData.hasTokenActions(data));
    }

    @Test
    public void refusesBlankTokens() {
        Map<String, String> data = seriesPrompt();
        data.put("acceptActionToken", "   ");
        data.put("declineActionToken", "   ");
        assertFalse(TokenActionPushData.hasTokenActions(data));
    }

    /** A second alert for the same game replaces the first rather than stacking. */
    @Test
    public void reusesTheDataPushNotificationId() {
        TokenActionPushData parsed = TokenActionPushData.fromMap(organizerWeatherAlert());
        assertNotNull(parsed);
        assertEquals(
            DataPushNotificationHelper.notificationId(organizerWeatherAlert()),
            parsed.notificationId()
        );
    }

    @Test
    public void keepsSignedTokensOutOfTapExtras() {
        Map<String, String> seriesExtras = DataPushNotificationHelper.tapExtrasMap(seriesPrompt());
        assertFalse(seriesExtras.containsKey("acceptActionToken"));
        assertFalse(seriesExtras.containsKey("declineActionToken"));
        assertEquals("finished-game", seriesExtras.get("sourceGameId"));

        Map<String, String> weatherExtras =
            DataPushNotificationHelper.tapExtrasMap(organizerWeatherAlert());
        assertFalse(weatherExtras.containsKey("weatherKeepActionToken"));
        assertEquals(
            "/games/game-1?section=weather&action=moveIndoor",
            weatherExtras.get("weatherDeepLink")
        );
    }

    @Test
    public void treatsBothFamiliesTokensAsLauncherPoison() {
        assertTrue(PushIntentSanitizer.hasPushPoisonKeys(seriesPrompt().keySet()));
        assertTrue(PushIntentSanitizer.hasPushPoisonKeys(organizerWeatherAlert().keySet()));
    }

    /**
     * `nativeHandler` alone must not swallow the push: when nothing can be
     * rendered with buttons, `TokenActionNotificationHelper.show` returns false
     * and `ChatReplyMessagingService` falls through to the ordinary card.
     */
    @Test
    public void anIncompletePayloadFallsBackToAnOrdinaryNotification() {
        Map<String, String> data = seriesPrompt();
        data.put("nativeHandler", "series_actions");
        data.remove("acceptActionToken");
        data.remove("declineActionToken");

        assertNull(TokenActionPushData.fromMap(data));
        assertTrue(DataPushNotificationHelper.canShow(data));
    }
}
