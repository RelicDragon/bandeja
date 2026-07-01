import { PushNotifications, PushNotificationSchema, ActionPerformed, Token } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import api from '@/api/axios';
import { invitesApi } from '@/api/invites';
import { userTeamsApi } from '@/api/userTeams';
import { navigationService } from './navigationService';
import { getAppInfo } from '@/utils/capacitor';
import { pushApi } from '@/api/push';
import { useAuthStore } from '@/store/authStore';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { parsePushChatContext } from '@/services/push/parsePushChatContext';
import { sendChatReplyFromPush } from '@/services/push/sendChatReplyFromPush';
import { applyPushUnreadBadgeFromNotification } from '@/services/push/applyPushUnreadBadge';
import {
  PUSH_ACTION_ACCEPT,
  PUSH_ACTION_DECLINE,
  PUSH_ACTION_REPLY,
  PUSH_REPLY_MAX_CONTENT_LENGTH,
} from '@/services/push/pushNotificationConstants';
import { chatApi } from '@/api/chat';
import { restoreAuthIfNeeded } from '@/utils/authPersistence';
import { getTokenNative } from '@/services/authBridge';
import { setPushReplyJsReadyNative } from '@/services/push/pushDelegateBridge';
import { hasExplicitLogoutMarker } from '@/utils/authExplicitLogout';

interface NotificationData {
  type: string;
  data?: {
    gameId?: string;
    bugId?: string;
    marketItemId?: string;
    userId?: string;
    inviteId?: string;
    chatType?: string;
    messageId?: string;
    userChatId?: string;
    groupChannelId?: string;
    teamId?: string;
    leagueSeasonId?: string;
    scheduleSubtab?: string;
    scheduleGroup?: string;
    scheduleRoundId?: string;
    chatContextType?: string;
    contextId?: string;
    replyToken?: string;
  };
}

class PushNotificationService {
  private isInitialized = false;
  private lastReceivedToken: string | null = null;
  private lastTokenSentToBackend: string | null = null;
  private pendingNotificationTap: { data: NotificationData; rawData: unknown } | null = null;
  private pendingTapRetryTimer: ReturnType<typeof setTimeout> | null = null;

  async initialize() {
    if (!Capacitor.isNativePlatform() || this.isInitialized) {
      return;
    }

    try {
      await this.requestPermissions();
      await this.registerListeners();
      await this.register();
      this.isInitialized = true;
      console.log('✅ Push notifications initialized');
    } catch (error) {
      console.error('❌ Failed to initialize push notifications:', error);
    }
  }

  private async requestPermissions() {
    const result = await PushNotifications.requestPermissions();
    
    if (result.receive === 'granted') {
      console.log('✅ Push notification permission granted');
      return true;
    } else {
      console.log('❌ Push notification permission denied');
      return false;
    }
  }

  private async register() {
    await PushNotifications.register();
  }

  flushPendingNotificationTap() {
    void this.dispatchNotificationTap();
  }

  private clearPendingTapRetry() {
    if (this.pendingTapRetryTimer) {
      clearTimeout(this.pendingTapRetryTimer);
      this.pendingTapRetryTimer = null;
    }
  }

  private schedulePendingTapRetry() {
    if (this.pendingTapRetryTimer || !this.pendingNotificationTap) return;
    this.pendingTapRetryTimer = setTimeout(() => {
      this.pendingTapRetryTimer = null;
      void this.dispatchNotificationTap();
    }, 250);
  }

  private async dispatchNotificationTap() {
    const pending = this.pendingNotificationTap;
    if (!pending) return;

    if (!navigationService.isReady()) {
      this.schedulePendingTapRetry();
      return;
    }

    this.clearPendingTapRetry();
    this.pendingNotificationTap = null;
    await this.handleNotificationTap(pending.data, pending.rawData);
  }

  async ensureTokenSentToBackend() {
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    if (!this.isInitialized) {
      await this.initialize();
    }
    if (!this.isInitialized) {
      return;
    }
    if (this.lastReceivedToken) {
      await this.registerTokenWithBackend(this.lastReceivedToken);
    } else {
      await this.register();
    }
  }

  private async registerListeners() {
    await PushNotifications.addListener('registration', async (token: Token) => {
      console.log('Push registration success, token:', token.value);
      this.lastReceivedToken = token.value;
      await this.registerTokenWithBackend(token.value);
    });

    await PushNotifications.addListener('registrationError', (error: any) => {
      console.error('Error on registration:', error);
    });

    await PushNotifications.addListener(
      'pushNotificationReceived',
      async (notification: PushNotificationSchema) => {
        console.log('Push notification received:', notification);
        await applyPushUnreadBadgeFromNotification(notification);
        if (Capacitor.getPlatform() === 'android' && parsePushChatContext(notification.data)) {
          return;
        }
        await this.confirmPushMessageReceipt(notification.data);
      }
    );

    await PushNotifications.addListener(
      'pushNotificationActionPerformed',
      async (action: ActionPerformed) => {
        console.log('Push notification action performed:', action);
        await this.handleNotificationAction(action);
      }
    );

    if (Capacitor.getPlatform() === 'ios') {
      await setPushReplyJsReadyNative(true);
    }
  }

  private async registerTokenWithBackend(token: string) {
    const platform = Capacitor.getPlatform() === 'ios' ? 'IOS' : 'ANDROID';
    const deviceId = await this.getDeviceId();
    const appInfo = await getAppInfo();
    const appVersion = appInfo?.version;
    const appBuild =
      appInfo?.buildNumber != null
        ? parseInt(String(appInfo.buildNumber), 10)
        : undefined;
    const oldToken = this.lastTokenSentToBackend;
    const useRenew = oldToken != null && oldToken !== token;
    const validBuild = Number.isInteger(appBuild) && (appBuild as number) > 0 ? (appBuild as number) : undefined;
    const delays = [0, 1000, 2000];
    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, delays[attempt]));
      }
      try {
        if (useRenew) {
          await pushApi.renewToken(
            oldToken,
            token,
            appVersion,
            validBuild
          );
          console.log('✅ Token renewed with backend');
        } else {
          const body: Record<string, unknown> = { token, platform, deviceId };
          if (appVersion) body.appVersion = appVersion;
          if (validBuild != null) body.appBuild = validBuild;
          await api.post('/push/tokens', body);
          console.log('✅ Token registered with backend');
        }
        this.lastTokenSentToBackend = token;
        return;
      } catch (error: any) {
        const status = error?.response?.status;
        if (status >= 400 && status < 500) {
          console.error('❌ Failed to send token to backend (client error):', error);
          return;
        }
        if (status === 404 && useRenew) {
          this.lastTokenSentToBackend = null;
          await this.registerTokenWithBackend(token);
          return;
        }
        if (attempt === delays.length - 1) {
          console.error('❌ Failed to send token to backend after retries:', error);
        }
      }
    }
  }

  private async getDeviceId(): Promise<string | undefined> {
    try {
      return Capacitor.getPlatform();
    } catch {
      return undefined;
    }
  }

  private normalizeNotificationData(rawData: any): NotificationData | null {
    if (!rawData || typeof rawData !== 'object') {
      return null;
    }

    // Handle iOS structure: { type: "GAME_CHAT", data: { gameId: "123" } }
    if (rawData.type && rawData.data && typeof rawData.data === 'object') {
      return {
        type: rawData.type,
        data: rawData.data
      };
    }

    // Handle Android flattened structure: { type: "GAME_CHAT", gameId: "123", ... }
    if (rawData.type) {
      const { type, ...rest } = rawData;
      return {
        type,
        data: rest
      };
    }

    return null;
  }

  private tryNavigateToBracketSchedule(payload: NotificationData['data']): boolean {
    if (payload?.scheduleSubtab !== 'bracket' || !payload.leagueSeasonId) return false;
    navigationService.navigateToLeagueSeasonSchedule(payload.leagueSeasonId, {
      subtab: 'bracket',
      group: payload.scheduleGroup,
      roundId: payload.scheduleRoundId,
    });
    return true;
  }

  private async handleNotificationAction(action: ActionPerformed) {
    const { actionId, notification } = action;
    const normalizedData = this.normalizeNotificationData(notification.data);

    if (!normalizedData || !normalizedData.type) {
      console.error('Invalid notification data:', notification.data);
      return;
    }

    if (actionId === 'tap') {
      this.pendingNotificationTap = { data: normalizedData, rawData: notification.data };
      await this.dispatchNotificationTap();
    } else if (actionId === PUSH_ACTION_ACCEPT) {
      if (normalizedData.type === 'TEAM_INVITE') {
        await this.handleAcceptTeamInvite(normalizedData);
      } else {
        await this.handleAcceptInvite(normalizedData);
      }
    } else if (actionId === PUSH_ACTION_DECLINE) {
      if (normalizedData.type === 'TEAM_INVITE') {
        await this.handleDeclineTeamInvite(normalizedData);
      } else {
        await this.handleDeclineInvite(normalizedData);
      }
    } else if (actionId === PUSH_ACTION_REPLY && action.inputValue?.trim()) {
      const ctx = parsePushChatContext(notification.data);
      if (!ctx?.chatContextType || !ctx?.contextId || !ctx?.messageId) {
        return;
      }
      const content = action.inputValue.trim().slice(0, PUSH_REPLY_MAX_CONTENT_LENGTH);
      await this.handleChatReply(ctx, content);
    }
  }

  private async confirmPushMessageReceipt(rawData: unknown): Promise<void> {
    const ctx = parsePushChatContext(rawData);
    if (!ctx?.messageId) {
      return;
    }

    if (ctx.replyToken) {
      try {
        await api.post('/chat/push-confirm-receipt', { replyToken: ctx.replyToken });
      } catch (error) {
        console.warn('[push-reply] confirm receipt on receive (token) failed', error);
      }
      return;
    }

    restoreAuthIfNeeded();
    if (hasExplicitLogoutMarker()) {
      return;
    }
    let token = localStorage.getItem('token');
    if (!token && Capacitor.getPlatform() === 'ios') {
      token = await getTokenNative();
      if (token) {
        localStorage.setItem('token', token);
        useAuthStore.getState().setToken(token);
      }
    }
    if (!token) {
      return;
    }

    try {
      await chatApi.confirmMessageReceipt(ctx.messageId, 'push');
    } catch (error) {
      console.warn('[push-reply] confirm receipt on receive failed', error);
    }
  }

  private async handleChatReply(
    ctx: NonNullable<ReturnType<typeof parsePushChatContext>>,
    content: string
  ): Promise<void> {
    if (ctx.replyToken) {
      await sendChatReplyFromPush(ctx, content);
      return;
    }

    restoreAuthIfNeeded();
    if (hasExplicitLogoutMarker()) {
      return;
    }
    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void sendChatReplyFromPush(ctx, content));
      return;
    }
    await sendChatReplyFromPush(ctx, content);
  }

  private async handleNotificationTap(data: NotificationData, rawData: unknown) {
    const { type, data: payload } = data;

    switch (type) {
      case 'INVITE':
      case 'GAME_SYSTEM_MESSAGE':
      case 'GAME_REMINDER':
      case 'GAME_RESULTS':
      case 'NEW_GAME':
        if (this.tryNavigateToBracketSchedule(payload)) {
          break;
        }
        if (payload?.gameId) {
          navigationService.navigateToGame(payload.gameId);
        }
        break;

      case 'GAME_CHAT': {
        const chatCtx = parsePushChatContext(rawData);
        if (this.tryNavigateToBracketSchedule(payload)) {
          break;
        }
        if (chatCtx) {
          navigationService.navigateToGame(chatCtx.contextId, true, {
            forceReload: true,
            initialChatType: chatCtx.chatType,
            anchorMessageId: chatCtx.messageId,
          });
        } else if (payload?.gameId) {
          navigationService.navigateToGame(payload.gameId, true, {
            forceReload: true,
            initialChatType: payload?.chatType,
            anchorMessageId: payload?.messageId,
          });
        }
        break;
      }

      case 'BUG_CHAT':
      case 'NEW_BUG': {
        const chatCtx = type === 'BUG_CHAT' ? parsePushChatContext(rawData) : null;
        if (chatCtx?.groupChannelId) {
          navigationService.navigateToChannelChat(chatCtx.groupChannelId, {
            anchorMessageId: chatCtx.messageId,
          });
        } else if (chatCtx) {
          navigationService.navigateToBugChat(chatCtx.contextId);
        } else if (payload?.groupChannelId) {
          navigationService.navigateToChannelChat(payload.groupChannelId, {
            anchorMessageId: payload?.messageId,
          });
        } else if (payload?.bugId) {
          navigationService.navigateToBugChat(payload.bugId);
        } else {
          navigationService.navigateToBugsList();
        }
        break;
      }

      case 'USER_CHAT': {
        const chatCtx = parsePushChatContext(rawData);
        if (chatCtx) {
          navigationService.navigateToUserChat(chatCtx.userChatId ?? chatCtx.contextId, {
            anchorMessageId: chatCtx.messageId,
          });
        }
        break;
      }

      case 'GROUP_CHAT': {
        const chatCtx = parsePushChatContext(rawData);
        if (chatCtx?.bugId) {
          navigationService.navigateToBugChat(chatCtx.bugId);
        } else if (chatCtx?.marketItemId) {
          navigationService.navigateToMarketplace({ item: chatCtx.marketItemId });
        } else if (chatCtx) {
          navigationService.navigateToGroupChat(chatCtx.contextId, {
            anchorMessageId: chatCtx.messageId,
          });
        } else if (payload?.groupChannelId) {
          if (payload.bugId) {
            navigationService.navigateToBugChat(payload.bugId);
          } else if (payload.marketItemId) {
            navigationService.navigateToMarketplace({ item: payload.marketItemId });
          } else {
            navigationService.navigateToGroupChat(payload.groupChannelId, {
              anchorMessageId: payload?.messageId,
            });
          }
        }
        break;
      }

      case 'NEW_MARKET_ITEM':
      case 'AUCTION_OUTBID':
      case 'AUCTION_NEW_BID':
      case 'AUCTION_WON':
      case 'AUCTION_BIN_ACCEPTED':
        if (payload?.marketItemId) {
          navigationService.navigateToMarketplace({ item: payload.marketItemId });
        }
        break;

      case 'TEAM_INVITE':
      case 'TEAM_INVITE_ACCEPTED':
      case 'TEAM_INVITE_DECLINED':
      case 'TEAM_MEMBER_REMOVED':
      case 'TEAM_MEMBER_LEFT':
        if (payload?.teamId) {
          navigationService.navigateToUserTeam(payload.teamId);
        }
        break;

      case 'TEAM_DELETED':
        navigationService.navigateToHome();
        break;

      default:
        console.log('Unknown notification type:', type);
    }
  }

  private async handleAcceptInvite(data: NotificationData) {
    if (!data.data?.inviteId) {
      console.error('No invite ID in notification data');
      return;
    }

    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void this.handleAcceptInvite(data));
      return;
    }

    try {
      await invitesApi.accept(data.data.inviteId);
      console.log('✅ Invite accepted');
      
      if (data.data.gameId) {
        navigationService.navigateToGame(data.data.gameId);
      }
    } catch (error) {
      console.error('❌ Failed to accept invite:', error);
    }
  }

  private async handleDeclineInvite(data: NotificationData) {
    if (!data.data?.inviteId) {
      console.error('No invite ID in notification data');
      return;
    }

    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void this.handleDeclineInvite(data));
      return;
    }

    try {
      await invitesApi.decline(data.data.inviteId);
      console.log('✅ Invite declined');
    } catch (error) {
      console.error('❌ Failed to decline invite:', error);
    }
  }

  private async handleAcceptTeamInvite(data: NotificationData) {
    const teamId = data.data?.teamId;
    if (!teamId) {
      console.error('No team ID in notification data');
      return;
    }
    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void this.handleAcceptTeamInvite(data));
      return;
    }
    try {
      await userTeamsApi.accept(teamId);
      navigationService.navigateToUserTeam(teamId);
    } catch (error) {
      console.error('❌ Failed to accept team invite:', error);
    }
  }

  private async handleDeclineTeamInvite(data: NotificationData) {
    const teamId = data.data?.teamId;
    if (!teamId) {
      console.error('No team ID in notification data');
      return;
    }
    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void this.handleDeclineTeamInvite(data));
      return;
    }
    try {
      await userTeamsApi.decline(teamId);
    } catch (error) {
      console.error('❌ Failed to decline team invite:', error);
    }
  }

  async removeToken() {
    try {
      await PushNotifications.removeAllListeners();
      console.log('✅ Push notification listeners removed');
    } catch (error) {
      console.error('❌ Failed to remove push notification listeners:', error);
    }
  }
}

export default new PushNotificationService();
