package com.funified.bandeja.push;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ChatViewingBridge")
public class ChatViewingBridgePlugin extends Plugin {
    @PluginMethod
    public void setViewingChat(PluginCall call) {
        ChatViewingState.set(
            call.getString("userChatId"),
            call.getString("groupChannelId"),
            call.getString("gameChatId"),
            call.getString("gameChatType")
        );
        call.resolve();
    }

    @PluginMethod
    public void clearViewingChat(PluginCall call) {
        ChatViewingState.clear();
        call.resolve();
    }

    @PluginMethod
    public void clearConversationNotification(PluginCall call) {
        String conversationKey = call.getString("conversationKey");
        if (conversationKey == null || conversationKey.trim().isEmpty()) {
            call.reject("Missing conversationKey");
            return;
        }
        ChatNotificationHelper.cancelForConversationKey(getContext(), conversationKey.trim());
        call.resolve();
    }
}
