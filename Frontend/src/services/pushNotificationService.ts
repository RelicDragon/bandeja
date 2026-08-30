import { PushNotifications, PushNotificationSchema, ActionPerformed, Token } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import api from '@/api/axios';
import { gamesApi } from '@/api/games';
import { invitesApi } from '@/api/invites';
import { userTeamsApi } from '@/api/userTeams';
import { navigationService } from './navigationService';
import { getAppInfo } from '@/utils/capacitor';
import { pushApi } from '@/api/push';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { runWithOverlapConfirm } from '@/utils/gameSlotOverlapConfirm';
import { recoverGenderUnsetJoin, resolveGameLikeForPushInvite, runWithGenderForEvent } from '@/utils/genderJoinGate';
import { parsePushChatContext } from '@/services/push/parsePushChatContext';
import { sendChatReplyFromPush } from '@/services/push/sendChatReplyFromPush';
import { applyPushUnreadBadgeFromNotification } from '@/services/push/applyPushUnreadBadge';
import { useUnreadStore } from '@/store/unreadStore';
import {
  PUSH_ACTION_ACCEPT,
  PUSH_ACTION_DECLINE,
  PUSH_ACTION_PLAY_TOO,
  PUSH_ACTION_REPLY,
  PUSH_REPLY_MAX_CONTENT_LENGTH,
} from '@/services/push/pushNotificationConstants';
import { chatApi } from '@/api/chat';
import { restoreAuthIfNeeded } from '@/utils/authPersistence';
import { getTokenNative } from '@/services/authBridge';
import { setPushReplyJsReadyNative } from '@/services/push/pushDelegateBridge';
import { consumePendingPushTapNative, addPendingPushTapListener } from '@/services/push/pushTapBridge';
import { registerPushNotificationActionTypes } from '@/services/push/registerPushNotificationActionTypes';
import { hasExplicitLogoutMarker } from '@/utils/authExplicitLogout';
import { queryClient } from '@/queries/queryClient';
import { playIntentKeys } from '@/hooks/usePlayIntent';
import { isPlayIntentPushType } from '@/services/push/isPlayIntentPushType';
import { decodeJwtExpMs } from '@/api/authRefresh';
import { blockAndroidLauncherIconChangesForNativeUi } from '@/services/androidLauncherIconScheduler';

interface NotificationData {
  type: string;
  data?: {
    gameId?: string;
    genderTeams?: string;
    entityType?: string;
    proposalId?: string;
    playIntentId?: string;
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
  private listenersRegistered = false;
  private earlyInitInFlight: Promise<void> | null = null;
  private registrationInFlight: Promise<void> | null = null;
  private permissionRequestQueued = false;
  private permissionPromptAttempted = false;
  private nativeRegistrationComplete = false;
  private lastReceivedToken: string | null = null;
  private lastTokenSentToBackend: string | null = null;
  private pendingNotificationTap: { data: NotificationData; rawData: unknown } | null = null;
  private pendingTapRetryTimer: ReturnType<typeof setTimeout> | null = null;

  /** Early init: iOS action categories + event listeners. No permission prompt. */
  async initializeEarly() {
    if (!Capacitor.isNativePlatform() || this.listenersRegistered) {
      return;
    }
    if (this.earlyInitInFlight) {
      await this.earlyInitInFlight;
      return;
    }

    this.earlyInitInFlight = this.runInitializeEarly();
    try {
      await this.earlyInitInFlight;
    } finally {
      this.earlyInitInFlight = null;
    }
  }

  private async runInitializeEarly() {
    try {
      if (Capacitor.getPlatform() === 'ios') {
        try {
          await registerPushNotificationActionTypes();
        } catch (error) {
          console.warn('Failed to register push notification action types:', error);
        }
      }

      await this.registerListeners();
      this.listenersRegistered = true;
      console.log('✅ Push notification listeners ready');
    } catch (error) {
      console.error('❌ Failed to initialize push listeners:', error);
      try {
        await PushNotifications.removeAllListeners();
      } catch {
        /* ignore cleanup failure */
      }
    }
  }

  /** Post-auth: permission check/request + APNs/FCM register. Requires initializeEarly(). */
  async initialize() {
    await this.ensureTokenSentToBackend({ requestPermission: true });
  }

  private async resolvePushPermission(allowRequest: boolean): Promise<boolean> {
    const checked = await PushNotifications.checkPermissions();
    if (checked.receive === 'granted') {
      console.log('✅ Push notification permission already granted');
      return true;
    }
    if (checked.receive === 'denied') {
      console.log('❌ Push notification permission denied');
      return false;
    }
    if (!allowRequest || this.permissionPromptAttempted) {
      return false;
    }

    // An automatic post-login prompt is attempted at most once per process. React remounts,
    // foreground sync, and overlapping login completions must not stack native permission calls.
    this.permissionPromptAttempted = true;
    const releaseLauncherIconBlock =
      Capacitor.getPlatform() === 'android'
        ? blockAndroidLauncherIconChangesForNativeUi()
        : () => undefined;
    let result;
    try {
      result = await PushNotifications.requestPermissions();
    } finally {
      releaseLauncherIconBlock();
    }
    if (result.receive === 'granted') {
      console.log('✅ Push notification permission granted');
      return true;
    }
    console.log('❌ Push notification permission denied');
    return false;
  }

  private async register() {
    if (this.nativeRegistrationComplete) return;
    try {
      await PushNotifications.register();
      this.nativeRegistrationComplete = true;
    } catch (error) {
      this.nativeRegistrationComplete = false;
      throw error;
    }
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

  private canSyncPushTokenToBackend(): boolean {
    const auth = useAuthStore.getState();
    if (!auth.isAuthenticated || !auth.token || auth.isInitializing) {
      return false;
    }
    const expMs = decodeJwtExpMs(auth.token);
    if (!expMs) {
      return false;
    }
    return expMs > Date.now();
  }

  private async syncKnownTokenToBackend(): Promise<boolean> {
    if (!this.lastReceivedToken || !this.canSyncPushTokenToBackend()) {
      return false;
    }
    if (this.lastTokenSentToBackend === this.lastReceivedToken) {
      return true;
    }
    await this.registerTokenWithBackend(this.lastReceivedToken);
    return this.lastTokenSentToBackend === this.lastReceivedToken;
  }

  async ensureTokenSentToBackend(opts?: { requestPermission?: boolean }) {
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    if (opts?.requestPermission) {
      this.permissionRequestQueued = true;
    }

    // A permission-requesting call can arrive while login's silent token sync is running. Keep
    // draining until this caller sees its request consumed; a single mutable promise alone loses
    // or duplicates work when several prompting callers overlap.
    while (true) {
      const inFlight = this.registrationInFlight ?? this.startRegistrationDrain();
      await inFlight;
      if (!this.permissionRequestQueued) return;
    }
  }

  private startRegistrationDrain(): Promise<void> {
    const task = this.drainRegistrationRequests();
    this.registrationInFlight = task;
    void task.then(
      () => {
        if (this.registrationInFlight === task) this.registrationInFlight = null;
      },
      () => {
        if (this.registrationInFlight === task) this.registrationInFlight = null;
      },
    );
    return task;
  }

  private async drainRegistrationRequests(): Promise<void> {
    do {
      const requestPermission = this.permissionRequestQueued;
      this.permissionRequestQueued = false;
      try {
        await this.runEnsureTokenSentToBackend(requestPermission);
      } catch (error) {
        // Push setup is auxiliary to authentication. Native bridge, FCM, or backend failures are
        // retried by the next foreground sync and must never become an unhandled login rejection.
        console.error('❌ Failed to sync push registration:', error);
      }
    } while (this.permissionRequestQueued);
  }

  private async runEnsureTokenSentToBackend(requestPermission: boolean) {
    await this.initializeEarly();
    if (!this.listenersRegistered || !this.canSyncPushTokenToBackend()) {
      return;
    }

    if (await this.syncKnownTokenToBackend()) {
      return;
    }

    const allowed = await this.resolvePushPermission(requestPermission);
    if (!allowed) {
      return;
    }

    await this.register();
    await this.syncKnownTokenToBackend();
  }

  private async registerListeners() {
    if (this.listenersRegistered) {
      return;
    }

    await PushNotifications.addListener('registration', async (token: Token) => {
      try {
        console.log('Push registration success, token:', token.value);
        this.lastReceivedToken = token.value;
        if (this.canSyncPushTokenToBackend()) {
          await this.registerTokenWithBackend(token.value);
        }
      } catch (error) {
        console.error('Push registration token sync failed:', error);
      }
    });

    await PushNotifications.addListener('registrationError', (error: any) => {
      console.error('Error on registration:', error);
    });

    await PushNotifications.addListener(
      'pushNotificationReceived',
      async (notification: PushNotificationSchema) => {
        try {
          console.log('Push notification received:', notification);
          await applyPushUnreadBadgeFromNotification(notification);
          const auth = useAuthStore.getState();
          if (auth.isAuthenticated && !auth.isInitializing) {
            void useUnreadStore.getState().refreshAll();
          }
          const normalized = this.normalizeNotificationData(notification.data);
          if (isPlayIntentPushType(normalized?.type)) {
            void queryClient.invalidateQueries({ queryKey: playIntentKeys.all });
          }
          if (Capacitor.getPlatform() === 'android' && parsePushChatContext(notification.data)) {
            return;
          }
          await this.confirmPushMessageReceipt(notification.data);
        } catch (error) {
          console.error('pushNotificationReceived handler failed:', error);
        }
      }
    );

    await PushNotifications.addListener(
      'pushNotificationActionPerformed',
      async (action: ActionPerformed) => {
        try {
          console.log('Push notification action performed:', action);
          await this.handleNotificationAction(action);
        } catch (error) {
          console.error('pushNotificationActionPerformed handler failed:', error);
        }
      }
    );

    if (Capacitor.getPlatform() === 'android') {
      await addPendingPushTapListener((action) => {
        void this.handleNativePendingPushTap(action);
      });
      await this.consumeNativePendingPushTap();
    }

    if (Capacitor.getPlatform() === 'ios') {
      await setPushReplyJsReadyNative(true);
    }
  }

  private async handleNativePendingPushTap(action: {
    pending?: boolean;
    actionId?: string;
    notification?: { id?: string; data?: Record<string, unknown> };
  }) {
    try {
      if (!action?.pending || !action.notification) {
        return;
      }
      await this.handleNotificationAction({
        actionId: action.actionId || 'tap',
        notification: {
          id: action.notification.id || 'bandeja-push-tap',
          data: action.notification.data || {},
        },
      } as ActionPerformed);
    } catch (error) {
      console.error('pendingPushTap handler failed:', error);
    }
  }

  /** Drain store if publish raced before the bridge plugin handle was ready. */
  private async consumeNativePendingPushTap() {
    try {
      const pending = await consumePendingPushTapNative();
      if (!pending) {
        return;
      }
      await this.handleNativePendingPushTap(pending);
    } catch (error) {
      console.error('consumeNativePendingPushTap failed:', error);
    }
  }

  private async registerTokenWithBackend(token: string) {
    if (!this.canSyncPushTokenToBackend()) {
      return;
    }
    if (this.lastTokenSentToBackend === token) {
      return;
    }

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

  private refreshUnreadIfAuthenticated(): void {
    const auth = useAuthStore.getState();
    if (auth.isAuthenticated && !auth.isInitializing) {
      void useUnreadStore.getState().refreshAll();
    }
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
      this.refreshUnreadIfAuthenticated();
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
    } else if (
      actionId === PUSH_ACTION_PLAY_TOO &&
      normalizedData.type === 'FOLLOWED_USER_PLAY_INTENT'
    ) {
      this.pendingNotificationTap = {
        data: normalizedData,
        rawData: notification.data,
      };
      await this.dispatchNotificationTap();
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
      case 'GAME_CANCELLED':
      case 'MATCH_TIMER_CAP':
      case 'NEW_GAME':
      case 'GAME_MATCHES_INTENT':
      case 'INTENT_PLAYERS_FOR_GAME':
        if (this.tryNavigateToBracketSchedule(payload)) {
          break;
        }
        if (payload?.gameId) {
          navigationService.navigateToGame(payload.gameId);
        }
        break;

      case 'PLAY_INTENT_MATCH':
        if (payload?.proposalId) {
          navigationService.navigateToFind({ proposal: payload.proposalId });
        } else {
          navigationService.navigateToFind({ lobby: 1 });
        }
        break;

      case 'FOLLOWED_USER_PLAY_INTENT':
        if (payload?.playIntentId) {
          navigationService.navigateToHome({ playIntent: payload.playIntentId });
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
          const channelId = chatCtx.groupChannelId ?? chatCtx.contextId;
          if (channelId) {
            navigationService.navigateToChannelChat(channelId, {
              anchorMessageId: chatCtx.messageId,
              filter: 'market',
            });
          }
        } else if (chatCtx) {
          navigationService.navigateToGroupChat(chatCtx.contextId, {
            anchorMessageId: chatCtx.messageId,
          });
        } else if (payload?.groupChannelId) {
          if (payload.bugId) {
            navigationService.navigateToBugChat(payload.bugId);
          } else if (payload.marketItemId) {
            navigationService.navigateToChannelChat(payload.groupChannelId, {
              anchorMessageId: payload?.messageId,
              filter: 'market',
            });
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
    const payload = data.data;
    const inviteId = payload?.inviteId;
    if (!inviteId) {
      console.error('No invite ID in notification data');
      return;
    }

    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void this.handleAcceptInvite(data));
      return;
    }
    if (authUser && authUser.genderIsSet !== true) {
      const gameLike = await resolveGameLikeForPushInvite(payload, async (gameId) => {
        const gameResponse = await gamesApi.getById(gameId);
        return gameResponse.data;
      });
      if (gameLike && !runWithGenderForEvent(gameLike, () => void this.handleAcceptInvite(data))) return;
    }

    try {
      const response = await runWithOverlapConfirm((confirmOverlap) =>
        invitesApi.accept(inviteId, confirmOverlap),
      );
      if (!response) return;
      useHeaderStore.getState().decrementPendingInvite(inviteId);
      console.log('✅ Invite accepted');

      if (payload.gameId) {
        navigationService.navigateToGame(payload.gameId);
      }
    } catch (error) {
      if (recoverGenderUnsetJoin(error, () => void this.handleAcceptInvite(data))) return;
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
      useHeaderStore.getState().decrementPendingInvite(data.data.inviteId);
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

  resetForLogout() {
    this.clearPendingTapRetry();
    this.pendingNotificationTap = null;
    // FCM/APNs device token is unchanged; drop only backend sync state for the next user.
    this.lastTokenSentToBackend = null;
    this.permissionRequestQueued = false;
  }

  async removeToken() {
    this.resetForLogout();
    if (!this.listenersRegistered) {
      return;
    }
    try {
      await PushNotifications.removeAllListeners();
      this.listenersRegistered = false;
      console.log('✅ Push notification listeners removed');
    } catch (error) {
      console.error('❌ Failed to remove push notification listeners:', error);
    }
  }
}

export default new PushNotificationService();
