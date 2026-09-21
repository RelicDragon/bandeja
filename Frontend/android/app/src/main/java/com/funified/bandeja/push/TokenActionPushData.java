package com.funified.bandeja.push;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * PRD 345 / 357 — a data push whose shade buttons each carry a signed action
 * token, or open the app at a server-authored destination.
 *
 * <p>Generic on purpose. The attendance pair (PRD 346) predates this and has its
 * own pair of classes; everything added after it is a list of
 * {@link Action}s built from one table below, so a third family costs a row
 * rather than three files.
 *
 * <p>Two kinds of button:
 * <ul>
 *   <li><b>token</b> — posts {@code actionToken} to the unauthenticated push
 *       action endpoint and replaces the card with {@code ack}. Never opens the
 *       app.</li>
 *   <li><b>foreground</b> — opens the app on the tap payload, exactly like
 *       tapping the body. Used when the answer needs a screen.</li>
 * </ul>
 */
public final class TokenActionPushData {
    /** One shade button. */
    public static final class Action {
        public final String id;
        public final String title;
        /** Signed token, or {@code null} for a foreground button. */
        public final String actionToken;
        /** Shade acknowledgement after a successful post, or {@code null} to just dismiss. */
        public final String ack;

        Action(String id, String title, String actionToken, String ack) {
            this.id = id;
            this.title = title;
            this.actionToken = actionToken;
            this.ack = ack;
        }

        public boolean isForeground() {
            return actionToken == null;
        }
    }

    /** The data keys one notification type reads for one button. */
    private static final class Spec {
        final String id;
        final String tokenKey;
        final String titleKey;
        final String fallbackTitleRes;
        final String ackKey;

        Spec(String id, String tokenKey, String titleKey, String fallbackTitleRes, String ackKey) {
            this.id = id;
            this.tokenKey = tokenKey;
            this.titleKey = titleKey;
            this.fallbackTitleRes = fallbackTitleRes;
            this.ackKey = ackKey;
        }
    }

    private static final String TYPE_SERIES = "GAME_SERIES_NEXT_PROMPT";
    private static final String TYPE_WEATHER = "GAME_WEATHER_ALERT";

    public final String type;
    public final String title;
    public final String body;
    public final String gameId;
    public final List<Action> actions;

    private TokenActionPushData(
        String type,
        String title,
        String body,
        String gameId,
        List<Action> actions
    ) {
        this.type = type;
        this.title = title;
        this.body = body;
        this.gameId = gameId;
        this.actions = Collections.unmodifiableList(actions);
    }

    /**
     * {@code true} when this push is one of the families handled here **and**
     * carries at least one usable button. A payload that names the family but
     * signs nothing falls through to the ordinary data notification, so the
     * player still gets told.
     */
    public static boolean hasTokenActions(Map<String, String> data) {
        return fromMap(data) != null;
    }

    public static TokenActionPushData fromMap(Map<String, String> data) {
        if (data == null || data.isEmpty()) {
            return null;
        }
        String type = trim(data.get("type"));
        if (type == null) {
            return null;
        }

        List<Spec> specs = specsFor(type, data);
        if (specs.isEmpty()) {
            return null;
        }

        List<Action> actions = new ArrayList<>();
        for (Spec spec : specs) {
            String token = spec.tokenKey == null ? null : trim(data.get(spec.tokenKey));
            if (spec.tokenKey != null && token == null) {
                // A token button whose token did not arrive is not a button.
                continue;
            }
            String title = trim(data.get(spec.titleKey));
            if (title == null) {
                title = spec.fallbackTitleRes;
            }
            if (title == null) {
                continue;
            }
            actions.add(
                new Action(spec.id, title, token, spec.ackKey == null ? null : trim(data.get(spec.ackKey)))
            );
        }
        if (actions.isEmpty()) {
            return null;
        }

        return new TokenActionPushData(
            type,
            trim(data.get("title")),
            trim(data.get("body")),
            trim(data.get("gameId")),
            actions
        );
    }

    private static List<Spec> specsFor(String type, Map<String, String> data) {
        List<Spec> specs = new ArrayList<>();
        if (TYPE_SERIES.equals(type)) {
            // PRD 345 — "I'm in" / "Not this time". Both stay in the shade.
            specs.add(new Spec("accept", "acceptActionToken", "acceptActionTitle", null, "seriesAcceptAck"));
            specs.add(new Spec("decline", "declineActionToken", "declineActionTitle", null, "seriesDeclineAck"));
            return specs;
        }
        if (TYPE_WEATHER.equals(type)) {
            // PRD 357 — the organizer variant is the only one that signs a token;
            // both variants can open the app at `weatherDeepLink`.
            if (trim(data.get("moveIndoorActionTitle")) != null) {
                specs.add(new Spec("moveIndoor", null, "moveIndoorActionTitle", null, null));
            }
            if (trim(data.get("weatherKeepActionToken")) != null) {
                specs.add(new Spec("keep", "weatherKeepActionToken", "keepActionTitle", null, "weatherKeptAck"));
            }
            if (trim(data.get("forecastActionTitle")) != null) {
                specs.add(new Spec("forecast", null, "forecastActionTitle", null, null));
            }
            return specs;
        }
        return specs;
    }

    /**
     * Deliberately the same key {@link DataPushNotificationHelper#notificationId}
     * builds, so a second alert for the same game replaces the first instead of
     * stacking a duplicate card.
     */
    public int notificationId() {
        String key = type + ":" + (gameId != null ? gameId : "tap");
        return key.hashCode() & 0x7fffffff;
    }

    private static String trim(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
