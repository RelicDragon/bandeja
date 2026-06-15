package com.funified.bandeja.push;

import android.content.Context;
import com.funified.bandeja.auth.NativeApiConfig;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONObject;

public final class ChatReplyApiClient {
    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 30_000;
    private static final int UNREAD_BADGE_UNKNOWN = -1;

    public static final class ApiResult {
        public final int statusCode;
        public final boolean success;
        public final int unreadBadgeCount;

        ApiResult(int statusCode, boolean success) {
            this(statusCode, success, UNREAD_BADGE_UNKNOWN);
        }

        ApiResult(int statusCode, boolean success, int unreadBadgeCount) {
            this.statusCode = statusCode;
            this.success = success;
            this.unreadBadgeCount = unreadBadgeCount;
        }
    }

    private ChatReplyApiClient() {}

    public static ApiResult sendPushReply(Context context, ChatPushData data, String content) {
        if (data.replyToken == null || data.replyToken.isEmpty()) {
            return new ApiResult(401, false);
        }
        try {
            JSONObject body = new JSONObject();
            body.put("replyToken", data.replyToken);
            body.put("content", content);
            body.put(
                "clientMutationId",
                "push-reply:" + data.messageId + ":" + System.currentTimeMillis()
            );
            return postJson(context, "/chat/push-reply", null, body);
        } catch (Exception ignored) {
            return new ApiResult(-1, false);
        }
    }

    public static ApiResult createMessage(Context context, String token, ChatPushData data, String content) {
        try {
            JSONObject body = new JSONObject();
            body.put("chatContextType", data.chatContextType);
            body.put("contextId", data.contextId);
            body.put("content", content);
            body.put("mediaUrls", new org.json.JSONArray());
            body.put("replyToId", data.messageId);
            if (data.chatType != null) {
                body.put("chatType", data.chatType);
            }
            body.put(
                "clientMutationId",
                "push-reply:" + data.messageId + ":" + System.currentTimeMillis()
            );

            return postJson(context, "/chat/messages", token, body);
        } catch (Exception ignored) {
            return new ApiResult(-1, false);
        }
    }

    public static ApiResult acceptInvite(Context context, String token, String inviteId) {
        try {
            return postJson(context, "/invites/" + inviteId + "/accept", token, new JSONObject());
        } catch (Exception ignored) {
            return new ApiResult(-1, false);
        }
    }

    public static ApiResult declineInvite(Context context, String token, String inviteId) {
        try {
            return postJson(context, "/invites/" + inviteId + "/decline", token, new JSONObject());
        } catch (Exception ignored) {
            return new ApiResult(-1, false);
        }
    }

    public static ApiResult acceptTeamInvite(Context context, String token, String teamId) {
        try {
            return postJson(context, "/user-teams/" + teamId + "/accept", token, new JSONObject());
        } catch (Exception ignored) {
            return new ApiResult(-1, false);
        }
    }

    public static ApiResult declineTeamInvite(Context context, String token, String teamId) {
        try {
            return postJson(context, "/user-teams/" + teamId + "/decline", token, new JSONObject());
        } catch (Exception ignored) {
            return new ApiResult(-1, false);
        }
    }

    public static ApiResult confirmReceiptWithToken(Context context, String replyToken) {
        try {
            JSONObject body = new JSONObject();
            body.put("replyToken", replyToken);
            return postJson(context, "/chat/push-confirm-receipt", null, body);
        } catch (Exception ignored) {
            return new ApiResult(-1, false);
        }
    }

    public static ApiResult confirmReceipt(Context context, String token, String messageId) {
        try {
            JSONObject body = new JSONObject();
            body.put("messageId", messageId);
            body.put("deliveryMethod", "push");
            return postJson(context, "/chat/messages/confirm-receipt", token, body);
        } catch (Exception ignored) {
            return new ApiResult(-1, false);
        }
    }

    public static ApiResult markContextAsRead(Context context, String token, ChatPushData data) {
        try {
            if ("USER".equals(data.chatContextType)) {
                return postJson(
                    context,
                    "/chat/user-chats/" + data.contextId + "/mark-all-read",
                    token,
                    new JSONObject()
                );
            }
            if ("GAME".equals(data.chatContextType)) {
                JSONObject body = new JSONObject();
                if (data.chatType != null) {
                    body.put("chatTypes", new org.json.JSONArray().put(data.chatType));
                } else {
                    body.put("chatTypes", new org.json.JSONArray());
                }
                String gameId = data.gameId != null ? data.gameId : data.contextId;
                return postJson(context, "/chat/games/" + gameId + "/mark-all-read", token, body);
            }

            JSONObject body = new JSONObject();
            body.put("contextType", data.chatContextType);
            body.put("contextId", data.contextId);
            body.put("chatTypes", new org.json.JSONArray());
            return postJson(context, "/chat/mark-all-read", token, body);
        } catch (Exception ignored) {
            return new ApiResult(-1, false);
        }
    }

    private static ApiResult postJson(Context context, String path, String token, JSONObject body)
        throws Exception {
        String apiBase = NativeApiConfig.getApiBaseUrl(context);
        HttpURLConnection connection = (HttpURLConnection) new URL(apiBase + path).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        connection.setRequestProperty("Accept", "application/json");
        if (token != null && !token.isEmpty()) {
            connection.setRequestProperty("Authorization", "Bearer " + token);
        }

        byte[] payload = body.toString().getBytes("UTF-8");
        connection.setFixedLengthStreamingMode(payload.length);

        OutputStream outputStream = connection.getOutputStream();
        outputStream.write(payload);
        outputStream.flush();
        outputStream.close();

        int statusCode = connection.getResponseCode();
        InputStream stream = statusCode >= 400 ? connection.getErrorStream() : connection.getInputStream();
        String responseBody = readStream(stream);
        connection.disconnect();

        boolean success = statusCode >= 200 && statusCode < 300;
        int unreadBadgeCount = parseUnreadBadgeCount(responseBody);
        return new ApiResult(statusCode, success, unreadBadgeCount);
    }

    private static int parseUnreadBadgeCount(String responseBody) {
        if (responseBody == null || responseBody.isEmpty()) {
            return UNREAD_BADGE_UNKNOWN;
        }
        try {
            JSONObject json = new JSONObject(responseBody);
            if (!json.has("unreadBadgeCount") || json.isNull("unreadBadgeCount")) {
                return UNREAD_BADGE_UNKNOWN;
            }
            return Math.max(0, json.getInt("unreadBadgeCount"));
        } catch (Exception ignored) {
            return UNREAD_BADGE_UNKNOWN;
        }
    }

    private static String readStream(InputStream stream) {
        if (stream == null) {
            return "";
        }
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream))) {
            StringBuilder builder = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
            return builder.toString();
        } catch (Exception ignored) {
            return "";
        }
    }
}
