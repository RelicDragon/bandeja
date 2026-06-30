import { create } from 'zustand';
import { Capacitor } from '@capacitor/core';
import { User } from '@/types';
import i18n from '@/i18n/config';
import { syncTokenToNative, syncLogoutToNative, syncApiBaseUrlToNative, syncBrandingLogoToNative } from '@/services/authBridge';
import {
  clearRefreshBundle,
  getRefreshTokenForRequest,
  isWebHttpOnlyRefreshCookie,
  persistRefreshBundle,
} from '@/services/refreshTokenPersistence';
import { extractLanguageCode, detectTimeFormat, detectWeekStart, normalizeLanguageForProfile } from '@/utils/displayPreferences';
import { usersApi, authApi, pushApi } from '@/api';
import { clearProactiveAccessRefresh, scheduleProactiveAccessRefresh } from '@/api/authRefresh';
import { clearAllProactiveBooktimeRefresh } from '@/integrations/booktime/proactiveRefresh';
import { clearChatLocalStores } from '@/services/chat/chatThreadIndex';
import { clearChatThreadMemory } from '@/services/chat/chatThreadMemoryCache';
import { clearChatSyncScheduler } from '@/services/chat/chatSyncScheduler';
import { useChatSyncStore } from '@/store/chatSyncStore';
import { useShellNavStore } from '@/store/shellNavStore';
import { useReactionEmojiUsageStore } from '@/store/reactionEmojiUsageStore';
import { registerAuthAccessTokenSink } from '@/store/authAccessSink';
import { bumpApiAuthCredentialGeneration } from '@/api/apiAuthCredentialGeneration';
import { markLoginCompleted } from '@/utils/authLoginGrace';
import {
  getNativeAppIconSyncKey,
  syncNativeAppIconForUser,
} from '@/services/appIcon.service';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  setAuth: (
    user: User,
    token: string,
    opts?: { refreshToken?: string; currentSessionId?: string }
  ) => Promise<void>;
  setToken: (token: string) => void;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
  finishInitializing: () => void;
}

let logoutInFlight: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set, get) => {
  let savedUser = null;
  let savedToken = null;
  
  try {
    const userStr = localStorage.getItem('user');
    const tokenStr = localStorage.getItem('token');
    
    if (tokenStr) {
      savedToken = tokenStr;
      console.log('Token loaded from localStorage');
      syncTokenToNative(tokenStr);
      void syncApiBaseUrlToNative();
    }
    
    if (userStr) {
      savedUser = JSON.parse(userStr);
      console.log('User loaded from localStorage');
    }
  } catch (error) {
    console.error('Error loading auth from localStorage:', error);
    try {
      localStorage.removeItem('user');
      localStorage.removeItem('token');
    } catch (cleanupError) {
      console.error('Error cleaning up corrupted localStorage:', cleanupError);
    }
  }

  return {
    user: savedUser,
    token: savedToken,
    isAuthenticated: !!savedToken,
    isInitializing: true,
    setAuth: async (user, token, opts) => {
      markLoginCompleted();
      bumpApiAuthCredentialGeneration();
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('token', token);
      if (opts?.refreshToken) {
        await persistRefreshBundle(opts.refreshToken, opts.currentSessionId);
      } else if (opts?.currentSessionId && isWebHttpOnlyRefreshCookie()) {
        await persistRefreshBundle(undefined, opts.currentSessionId, { webCookieMode: true });
      } else {
        await clearRefreshBundle();
      }
      await syncTokenToNative(token);
      void syncApiBaseUrlToNative();
      set({ user, token, isAuthenticated: true });
      scheduleProactiveAccessRefresh(token);

      if (user.language) {
        const langCode = extractLanguageCode(user.language);
        i18n.changeLanguage(langCode);
      }

      syncNativeAppIconForUser(user);

      setTimeout(() => {
        void (async () => {
          const deviceLocale = navigator.language || 'en-GB';
          const normalizedLanguage = normalizeLanguageForProfile(user.language);
          const needsLanguageNormalization = user.language && normalizedLanguage !== user.language;
          const needsUpdate =
            !user.language ||
            needsLanguageNormalization ||
            !user.timeFormat ||
            !user.weekStart;

          if (!needsUpdate) return;

          const updates: Partial<User> = {};
          if (!user.language) {
            updates.language = deviceLocale;
          } else if (needsLanguageNormalization) {
            updates.language = normalizedLanguage;
          }
          if (!user.timeFormat) {
            updates.timeFormat = detectTimeFormat(deviceLocale);
          }
          if (!user.weekStart) {
            updates.weekStart = detectWeekStart(deviceLocale);
          }
          if (Object.keys(updates).length === 0) return;

          let userToSet = user;
          try {
            const response = await usersApi.updateProfile(updates);
            userToSet = response.data;
          } catch (error) {
            console.error('Error auto-detecting preferences:', error);
            userToSet = { ...user, ...updates };
          }

          if (get().token !== token || !get().isAuthenticated) return;

          localStorage.setItem('user', JSON.stringify(userToSet));
          set({ user: userToSet });

          if (userToSet.language) {
            const langCode = extractLanguageCode(userToSet.language);
            i18n.changeLanguage(langCode);
          }

          syncNativeAppIconForUser(userToSet);
        })();
      }, 1500);
    },
    setToken: (token) => {
      try {
        localStorage.setItem('token', token);
        set({ token, isAuthenticated: true });
        syncTokenToNative(token);
      void syncApiBaseUrlToNative();
        scheduleProactiveAccessRefresh(token);
      } catch (error) {
        console.error('Error saving token to localStorage:', error);
      }
    },
    logout: async (): Promise<void> => {
      if (logoutInFlight) {
        console.info('[auth:logout] awaiting in-flight logout');
        await logoutInFlight;
        console.info('[auth:logout] in-flight done (coalesced return)');
        return;
      }

      const execute = async (): Promise<void> => {
        console.info('[auth:logout] execute start', {
          path: typeof window !== 'undefined' ? window.location.pathname : '',
          capNative: Capacitor.isNativePlatform(),
        });
        bumpApiAuthCredentialGeneration();
        clearProactiveAccessRefresh();
        clearAllProactiveBooktimeRefresh();
        try {
          await pushApi.removeAllTokens();
          console.info('[auth:logout] push removeAllTokens ok');
        } catch (e) {
          console.warn('[auth:logout] push removeAllTokens failed', e);
        }
        try {
          const rt = await getRefreshTokenForRequest();
          const httpOnly = isWebHttpOnlyRefreshCookie();
          const willCallServer =
            !Capacitor.isNativePlatform() || !!rt?.trim() || httpOnly;
          console.info('[auth:logout] server revoke check', {
            hasRtLen: (rt?.trim() ?? '').length,
            httpOnly,
            willCallServer,
          });
          if (willCallServer) {
            await authApi.logoutWithRefresh(rt?.trim() ? { refreshToken: rt.trim() } : {});
            console.info('[auth:logout] POST /auth/logout ok');
          } else {
            console.warn('[auth:logout] skipped POST /auth/logout (native, no refresh token)');
          }
        } catch (e) {
          console.warn('[auth:logout] server revoke failed', e);
        }
        await clearRefreshBundle();
        try {
          const warm = await import('@/services/chat/chatSyncBatchWarm');
          warm.resetChatSyncWarmSession();
          await clearChatLocalStores();
          clearChatSyncScheduler();
          warm.clearChatSyncWarmDrainQueue();
          useChatSyncStore.getState().resetChatListDexieBump();
          clearChatThreadMemory();
        } catch (e) {
          console.warn('[auth:logout] chat clear failed', e);
        }
        try {
          const { invalidateBooktimeAllUpcomingCache } = await import(
            '@/integrations/booktime/booktimeAllUpcomingLoader'
          );
          invalidateBooktimeAllUpcomingCache();
        } catch (e) {
          console.warn('[auth:logout] booktime upcoming cache clear failed', e);
        }
        try {
          localStorage.removeItem('user');
          localStorage.removeItem('token');
          localStorage.removeItem('auth_backup');
          sessionStorage.removeItem('app_navigation_tracked');
          useShellNavStore.getState().setMyGamesSelectedDay(null);
          useShellNavStore.getState().setFindSelectedDay(null);
          useShellNavStore.getState().setFindListWeekStartDay(null);
          useReactionEmojiUsageStore.getState().reset();
          void import('@/store/unreadStore').then(({ useUnreadStore }) => {
            useUnreadStore.getState().reset();
          });
          set({ user: null, token: null, isAuthenticated: false });
          console.info('[auth:logout] local session cleared', {
            lsToken: localStorage.getItem('token'),
            storeAuth: get().isAuthenticated,
          });
        } catch (error) {
          console.error('[auth:logout] Error clearing auth from localStorage:', error);
        }
        syncLogoutToNative();
        void syncBrandingLogoToNative('padel');
        bumpApiAuthCredentialGeneration();
        console.info('[auth:logout] execute end');
      };

      const run = execute();
      const fin = run.finally(() => {
        if (logoutInFlight === fin) logoutInFlight = null;
      });
      logoutInFlight = fin;
      await fin;
    },
    updateUser: (user) => {
      try {
        const prev = get().user;
        localStorage.setItem('user', JSON.stringify(user));
        set({ user });
        
        if (user.language) {
          const langCode = extractLanguageCode(user.language);
          i18n.changeLanguage(langCode);
        }

        if (getNativeAppIconSyncKey(prev) !== getNativeAppIconSyncKey(user)) {
          syncNativeAppIconForUser(user);
        }
      } catch (error) {
        console.error('Error updating user in localStorage:', error);
      }
    },
    finishInitializing: () => {
      set({ isInitializing: false });
    },
  };
});

registerAuthAccessTokenSink((token) => {
  useAuthStore.getState().setToken(token);
});
