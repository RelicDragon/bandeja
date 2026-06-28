package com.funified.bandeja.push;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;

public final class InvitePushData {
    private static final Set<String> INVITE_TYPES = new HashSet<>();

    static {
        INVITE_TYPES.add("INVITE");
        INVITE_TYPES.add("TEAM_INVITE");
    }

    public final String type;
    public final String title;
    public final String body;
    public final String inviteId;
    public final String gameId;
    public final String teamId;
    public final String acceptActionTitle;
    public final String declineActionTitle;

    private InvitePushData(
        String type,
        String title,
        String body,
        String inviteId,
        String gameId,
        String teamId,
        String acceptActionTitle,
        String declineActionTitle
    ) {
        this.type = type;
        this.title = title;
        this.body = body;
        this.inviteId = inviteId;
        this.gameId = gameId;
        this.teamId = teamId;
        this.acceptActionTitle = acceptActionTitle;
        this.declineActionTitle = declineActionTitle;
    }

    public static boolean isInvite(Map<String, String> data) {
        if (data == null || data.isEmpty()) {
            return false;
        }
        String type = trim(data.get("type"));
        if (type == null || !INVITE_TYPES.contains(type)) {
            return false;
        }
        if ("INVITE".equals(type)) {
            return hasText(data.get("inviteId"));
        }
        return hasText(data.get("teamId"));
    }

    public static InvitePushData fromMap(Map<String, String> data) {
        if (!isInvite(data)) {
            return null;
        }
        return new InvitePushData(
            trim(data.get("type")),
            trim(data.get("title")),
            trim(data.get("body")),
            trim(data.get("inviteId")),
            trim(data.get("gameId")),
            trim(data.get("teamId")),
            trim(data.get("acceptActionTitle")),
            trim(data.get("declineActionTitle"))
        );
    }

    public int notificationId() {
        String key = type + ":" + (inviteId != null ? inviteId : teamId);
        return Math.abs(key.hashCode());
    }

    public String messageId() {
        return type + ":" + (inviteId != null ? inviteId : teamId);
    }

    public boolean isTeamInvite() {
        return "TEAM_INVITE".equals(type);
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
}
