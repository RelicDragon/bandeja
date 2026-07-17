package com.funified.bandeja.push;

/**
 * Decides whether an incoming chat push should skip the system notification tray
 * because the user is already looking at that conversation in the foreground.
 */
public final class ChatPushViewingGuard {
    private ChatPushViewingGuard() {}

    public static boolean shouldSuppressDisplay(
        boolean appForeground,
        String viewingUserChatId,
        String viewingGroupChannelId,
        String viewingGameChatId,
        String viewingGameChatType,
        String pushContextType,
        String pushContextId,
        String pushChatType
    ) {
        if (!appForeground) {
            return false;
        }
        if (pushContextType == null || pushContextId == null) {
            return false;
        }
        String contextType = pushContextType.trim();
        String contextId = pushContextId.trim();
        if (contextType.isEmpty() || contextId.isEmpty()) {
            return false;
        }

        if ("USER".equals(contextType) || "USER_CHAT".equals(contextType)) {
            return contextId.equals(trimOrNull(viewingUserChatId));
        }
        if ("GROUP".equals(contextType) || "GROUP_CHAT".equals(contextType)
            || "BUG".equals(contextType) || "BUG_CHAT".equals(contextType)) {
            return contextId.equals(trimOrNull(viewingGroupChannelId));
        }
        if ("GAME".equals(contextType) || "GAME_CHAT".equals(contextType)) {
            if (!contextId.equals(trimOrNull(viewingGameChatId))) {
                return false;
            }
            String viewingType = normalizeGameChatType(viewingGameChatType);
            String pushType = normalizeGameChatType(pushChatType);
            return viewingType.equals(pushType);
        }
        return false;
    }

    public static boolean shouldSuppressDisplay(
        boolean appForeground,
        ChatViewingState.Snapshot viewing,
        ChatPushData push
    ) {
        if (viewing == null || push == null) {
            return false;
        }
        return shouldSuppressDisplay(
            appForeground,
            viewing.userChatId,
            viewing.groupChannelId,
            viewing.gameChatId,
            viewing.gameChatType,
            push.chatContextType,
            push.contextId,
            push.chatType
        );
    }

    private static String normalizeGameChatType(String chatType) {
        String trimmed = trimOrNull(chatType);
        return trimmed != null ? trimmed : "PUBLIC";
    }

    private static String trimOrNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
