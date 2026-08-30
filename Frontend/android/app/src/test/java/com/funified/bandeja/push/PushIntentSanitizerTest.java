package com.funified.bandeja.push;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import org.junit.Test;

public class PushIntentSanitizerTest {
    private static Set<String> keys(String... values) {
        return new HashSet<>(Arrays.asList(values));
    }

    @Test
    public void detectsMessageIdPoison() {
        assertTrue(
            PushIntentSanitizer.hasPushPoisonKeys(
                keys(PushTapIntentFactory.EXTRA_GOOGLE_MESSAGE_ID, "type")
            )
        );
    }

    @Test
    public void detectsJwtPoison() {
        assertTrue(PushIntentSanitizer.hasPushPoisonKeys(keys("replyToken")));
        assertTrue(PushIntentSanitizer.hasPushPoisonKeys(keys("acceptActionToken")));
        assertTrue(PushIntentSanitizer.hasPushPoisonKeys(keys("actionToken")));
    }

    @Test
    public void detectsLegacyRoutingPoison() {
        assertTrue(PushIntentSanitizer.hasPushPoisonKeys(keys("type", "messageId")));
        assertTrue(PushIntentSanitizer.hasPushPoisonKeys(keys("type", "inviteId")));
        assertTrue(PushIntentSanitizer.hasPushPoisonKeys(keys("type", "gameId")));
    }

    @Test
    public void ignoresCleanOrUnrelatedKeys() {
        assertFalse(PushIntentSanitizer.hasPushPoisonKeys(Collections.emptySet()));
        assertFalse(PushIntentSanitizer.hasPushPoisonKeys(keys("unrelated")));
        assertFalse(PushIntentSanitizer.hasPushPoisonKeys(keys("type")));
    }
}
