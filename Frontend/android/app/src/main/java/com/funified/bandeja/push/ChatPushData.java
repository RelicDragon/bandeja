package com.funified.bandeja.push;

import android.os.Bundle;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

public final class ChatPushData {
    public static final int MAX_REPLY_LENGTH = 4096;

    private static final Set<String> REPLYABLE_TYPES = new HashSet<>();

    static {
        REPLYABLE_TYPES.add("USER_CHAT");
        REPLYABLE_TYPES.add("GAME_CHAT");
        REPLYABLE_TYPES.add("GROUP_CHAT");
        REPLYABLE_TYPES.add("BUG_CHAT");
    }

    public final String type;
    public final String chatContextType;
    public final String contextId;
    public final String messageId;
    public final String chatType;
    public final String title;
    public final String body;
    public final String senderName;
    public final String threadId;
    public final String userChatId;
    public final String gameId;
    public final String groupChannelId;
    public final String bugId;
    public final String marketItemId;
    public final String replyToken;
    public final String previewImageUrl;
    public final String previewMediaType;
    public final Integer unreadBadgeCount;

    private ChatPushData(
        String type,
        String chatContextType,
        String contextId,
        String messageId,
        String chatType,
        String title,
        String body,
        String senderName,
        String threadId,
        String userChatId,
        String gameId,
        String groupChannelId,
        String bugId,
        String marketItemId,
        String replyToken,
        String previewImageUrl,
        String previewMediaType,
        Integer unreadBadgeCount
    ) {
        this.type = type;
        this.chatContextType = chatContextType;
        this.contextId = contextId;
        this.messageId = messageId;
        this.chatType = chatType;
        this.title = title;
        this.body = body;
        this.senderName = senderName;
        this.threadId = threadId;
        this.userChatId = userChatId;
        this.gameId = gameId;
        this.groupChannelId = groupChannelId;
        this.bugId = bugId;
        this.marketItemId = marketItemId;
        this.replyToken = replyToken;
        this.previewImageUrl = previewImageUrl;
        this.previewMediaType = previewMediaType;
        this.unreadBadgeCount = unreadBadgeCount;
    }

    public static boolean isReplyable(Map<String, String> data) {
        if (data == null || data.isEmpty()) {
            return false;
        }
        if (hasText(data.get("sourceType")) && hasText(data.get("sourceId"))) {
            return false;
        }
        String type = trim(data.get("type"));
        if (type == null || !REPLYABLE_TYPES.contains(type)) {
            return false;
        }
        return hasText(data.get("chatContextType"))
            && hasText(data.get("contextId"))
            && hasText(data.get("messageId"));
    }

    public static ChatPushData fromMap(Map<String, String> data) {
        if (!isReplyable(data)) {
            return null;
        }
        return new ChatPushData(
            trim(data.get("type")),
            trim(data.get("chatContextType")),
            trim(data.get("contextId")),
            trim(data.get("messageId")),
            trim(data.get("chatType")),
            trim(data.get("title")),
            trim(data.get("body")),
            trim(data.get("senderName")),
            trim(data.get("threadId")),
            trim(data.get("userChatId")),
            trim(data.get("gameId")),
            trim(data.get("groupChannelId")),
            trim(data.get("bugId")),
            trim(data.get("marketItemId")),
            trim(data.get("replyToken")),
            trim(data.get("previewImageUrl")),
            trim(data.get("previewMediaType")),
            parseUnreadBadgeCount(trim(data.get("unreadBadgeCount")))
        );
    }

    public static ChatPushData fromBundle(Bundle extras) {
        if (extras == null) {
            return null;
        }
        ChatPushData data = new ChatPushData(
            trim(extras.getString("type")),
            trim(extras.getString("chatContextType")),
            trim(extras.getString("contextId")),
            trim(extras.getString("messageId")),
            trim(extras.getString("chatType")),
            trim(extras.getString("title")),
            trim(extras.getString("body")),
            trim(extras.getString("senderName")),
            trim(extras.getString("threadId")),
            trim(extras.getString("userChatId")),
            trim(extras.getString("gameId")),
            trim(extras.getString("groupChannelId")),
            trim(extras.getString("bugId")),
            trim(extras.getString("marketItemId")),
            trim(extras.getString("replyToken")),
            trim(extras.getString("previewImageUrl")),
            trim(extras.getString("previewMediaType")),
            parseUnreadBadgeCount(trim(extras.getString("unreadBadgeCount")))
        );
        if (!isReplyableMap(data)) {
            return null;
        }
        return data;
    }

    private static boolean isReplyableMap(ChatPushData data) {
        return data.type != null
            && REPLYABLE_TYPES.contains(data.type)
            && data.chatContextType != null
            && data.contextId != null
            && data.messageId != null;
    }

    public String resolveThreadId() {
        if (threadId != null) {
            return threadId;
        }
        if ("USER".equals(chatContextType) || "USER_CHAT".equals(type)) {
            String id = userChatId != null ? userChatId : contextId;
            return "user-chat:" + id;
        }
        if ("GAME".equals(chatContextType) || "GAME_CHAT".equals(type)) {
            String id = gameId != null ? gameId : contextId;
            String resolvedChatType = chatType != null ? chatType : "PUBLIC";
            return "game-chat:" + id + ":" + resolvedChatType;
        }
        if ("GROUP".equals(chatContextType) || "GROUP_CHAT".equals(type)) {
            String id = groupChannelId != null ? groupChannelId : contextId;
            return "group:" + id;
        }
        if ("BUG".equals(chatContextType) || "BUG_CHAT".equals(type)) {
            String id = bugId != null ? bugId : contextId;
            return "bug:" + id;
        }
        return chatContextType + ":" + contextId;
    }

    public int notificationId() {
        return Math.abs(resolveThreadId().hashCode());
    }

    public String conversationKey() {
        return resolveThreadId();
    }

    public String truncateReply(String text) {
        if (text == null) {
            return "";
        }
        String trimmed = text.trim();
        if (trimmed.length() <= MAX_REPLY_LENGTH) {
            return trimmed;
        }
        return trimmed.substring(0, MAX_REPLY_LENGTH);
    }

    private static boolean hasText(String value) {
        return trim(value) != null;
    }

    private static String trim(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static Integer parseUnreadBadgeCount(String value) {
        if (value == null) {
            return null;
        }
        try {
            return Math.max(0, Integer.parseInt(value));
        } catch (NumberFormatException ignored) {
            return null;
        }
    }
}
