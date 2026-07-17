package com.funified.bandeja.push;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ChatPushViewingGuardTest {
    @Test
    public void suppressesMatchingDmWhenForeground() {
        assertTrue(
            ChatPushViewingGuard.shouldSuppressDisplay(
                true, "chat-1", null, null, null, "USER", "chat-1", null
            )
        );
    }

    @Test
    public void doesNotSuppressWhenBackgrounded() {
        assertFalse(
            ChatPushViewingGuard.shouldSuppressDisplay(
                false, "chat-1", null, null, null, "USER", "chat-1", null
            )
        );
    }

    @Test
    public void doesNotSuppressDifferentDm() {
        assertFalse(
            ChatPushViewingGuard.shouldSuppressDisplay(
                true, "chat-1", null, null, null, "USER", "chat-2", null
            )
        );
    }

    @Test
    public void suppressesMatchingGameChatType() {
        assertTrue(
            ChatPushViewingGuard.shouldSuppressDisplay(
                true, null, null, "game-1", "PRIVATE", "GAME", "game-1", "PRIVATE"
            )
        );
    }

    @Test
    public void doesNotSuppressDifferentGameChatType() {
        assertFalse(
            ChatPushViewingGuard.shouldSuppressDisplay(
                true, null, null, "game-1", "PUBLIC", "GAME", "game-1", "PRIVATE"
            )
        );
    }

    @Test
    public void defaultsMissingGameChatTypeToPublic() {
        assertTrue(
            ChatPushViewingGuard.shouldSuppressDisplay(
                true, null, null, "game-1", null, "GAME", "game-1", null
            )
        );
    }

    @Test
    public void suppressesBugViaGroupViewingId() {
        assertTrue(
            ChatPushViewingGuard.shouldSuppressDisplay(
                true, null, "bug-1", null, null, "BUG", "bug-1", null
            )
        );
    }
}
