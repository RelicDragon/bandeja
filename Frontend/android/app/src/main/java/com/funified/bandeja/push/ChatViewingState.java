package com.funified.bandeja.push;

/**
 * Process-local open-chat snapshot for FCM suppress checks.
 * Intentionally not persisted: "currently viewing" must die with the process so a cold
 * start cannot suppress notifications from a stale previous session.
 */
public final class ChatViewingState {
    private static volatile String userChatId;
    private static volatile String groupChannelId;
    private static volatile String gameChatId;
    private static volatile String gameChatType;

    private ChatViewingState() {}

    public static final class Snapshot {
        public final String userChatId;
        public final String groupChannelId;
        public final String gameChatId;
        public final String gameChatType;

        public Snapshot(String userChatId, String groupChannelId, String gameChatId, String gameChatType) {
            this.userChatId = userChatId;
            this.groupChannelId = groupChannelId;
            this.gameChatId = gameChatId;
            this.gameChatType = gameChatType;
        }
    }

    public static synchronized void set(
        String nextUserChatId,
        String nextGroupChannelId,
        String nextGameChatId,
        String nextGameChatType
    ) {
        userChatId = emptyToNull(nextUserChatId);
        groupChannelId = emptyToNull(nextGroupChannelId);
        gameChatId = emptyToNull(nextGameChatId);
        gameChatType = emptyToNull(nextGameChatType);
    }

    public static synchronized void clear() {
        userChatId = null;
        groupChannelId = null;
        gameChatId = null;
        gameChatType = null;
    }

    public static synchronized Snapshot snapshot() {
        return new Snapshot(userChatId, groupChannelId, gameChatId, gameChatType);
    }

    private static String emptyToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
