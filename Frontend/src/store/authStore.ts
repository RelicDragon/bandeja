import { create } from 'zustand';
import { User } from '@/types';
import i18n from '@/i18n/config';
import { syncTokenToNative, syncLogoutToNative } from '@/services/authBridge';
import {
  clearRefreshBundle,
  getRefreshTokenForRequest,
  isWebHttpOnlyRefreshCookie,
  persistRefreshBundle,
} from '@/services/refreshTokenPersistence';
import { extractLanguageCode, detectTimeFormat, detectWeekStart, normalizeLanguageForProfile } from '@/utils/displayPreferences';
import { usersApi, authApi, pushApi } from '@/api';
import { clearProactiveAccessRefresh, scheduleProactiveAccessRefresh } from '@/api/authRefresh';
import { clearChatLocalStores } from '@/services/chat/chatThreadIndex';
import { clearChatSyncScheduler } from '@/services/chat/chatSyncScheduler';
import { useChatSyncStore } from '@/store/chatSyncStore';
import { useNavigationStore } from '@/store/navigationStore';
import { useReactionEmojiUsageStore } from '@/store/reactionEmojiUsageStore';
import { registerAuthAccessTokenSink } from '@/store/authAccessSink';
import { bumpApiAuthCredentialGeneration } from '@/api/apiAuthCredentialGeneration';

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
  logout: () => void | Promise<void>;
  updateUser: (user: User) => void;
  finishInitializing: () => void;
}

let logoutInFlight: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set) => {
  let savedUser = null;
  let savedToken = null;
  
  try {
    const userStr = localStorage.getItem('user');
    const tokenStr = localStorage.getItem('token');
    
    if (tokenStr) {
      savedToken = tokenStr;
      console.log('Token loaded from localStorage');
      syncTokenToNative(tokenStr);
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
      bumpApiAuthCredentialGeneration();
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('token', token);
      set({ user, token, isAuthenticated: true });
      syncTokenToNative(token);
      if (opts?.refreshToken) {
        await persistRefreshBundle(opts.refreshToken, opts.currentSessionId);
      } else if (opts?.currentSessionId && isWebHttpOnlyRefreshCookie()) {
        await persistRefreshBundle(undefined, opts.currentSessionId, { webCookieMode: true });
      } else {
        await clearRefreshBundle();
      }
      scheduleProactiveAccessRefresh(token);

      const deviceLocale = navigator.language || 'en-GB';
      const normalizedLanguage = normalizeLanguageForProfile(user.language);
      const needsLanguageNormalization = user.language && normalizedLanguage !== user.language;
      const needsUpdate =
        !user.language ||
        needsLanguageNormalization ||
        !user.timeFormat ||
        !user.weekStart;

      let userToSet = user;

      if (needsUpdate) {
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

        if (Object.keys(updates).length > 0) {
          try {
            const response = await usersApi.updateProfile(updates);
            userToSet = response.data;
          } catch (error) {
            console.error('Error auto-detecting preferences:', error);
            userToSet = { ...user, ...updates };
          }
          localStorage.setItem('user', JSON.stringify(userToSet));
          set({ user: userToSet });
        }
      }

      if (userToSet.language) {
        const langCode = extractLanguageCode(userToSet.language);
        i18n.changeLanguage(langCode);
      }

      void import('@/services/chat/chatSyncBatchWarm').then((warm) => {
        warm.resetChatSyncWarmSession();
        void warm.ensureChatSyncWarmBootstrap();
      });
    },
    setToken: (token) => {
      try {
        localStorage.setItem('token', token);
        set({ token, isAuthenticated: true });
        syncTokenToNative(token);
        scheduleProactiveAccessRefresh(token);
      } catch (error) {
        console.error('Error saving token to localStorage:', error);
      }
    },
    logout: async () => {
      if (logoutInFlight) return logoutInFlight;

      const execute = async () => {
        clearProactiveAccessRefresh();
        try {
          await pushApi.removeAllTokens();
        } catch {
          /* ignore */
        }
        try {
          const rt = await getRefreshTokenForRequest();
          if (rt?.trim() || isWebHttpOnlyRefreshCookie()) {
            await authApi.logoutWithRefresh(rt?.trim() ? { refreshToken: rt.trim() } : {});
          }
        } catch {
          /* ignore */
        }
        await clearRefreshBundle();
        try {
          const warm = await import('@/services/chat/chatSyncBatchWarm');
          warm.resetChatSyncWarmSession();
          await clearChatLocalStores();
          clearChatSyncScheduler();
          warm.clearChatSyncWarmDrainQueue();
          useChatSyncStore.getState().resetChatListDexieBump();
        } catch {
          /* ignore */
        }
        try {
          localStorage.removeItem('user');
          localStorage.removeItem('token');
          localStorage.removeItem('auth_backup');
          sessionStorage.removeItem('app_navigation_tracked');
          useNavigationStore.getState().setMyGamesSelectedDay(null);
          useNavigationStore.getState().setFindSelectedDay(null);
          useNavigationStore.getState().setFindListWeekStartDay(null);
          useReactionEmojiUsageStore.getState().reset();
          set({ user: null, token: null, isAuthenticated: false });
        } catch (error) {
          console.error('Error clearing auth from localStorage:', error);
        }
        syncLogoutToNative();
        bumpApiAuthCredentialGeneration();
      };

      const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
      const run =
        typeof locks?.request === 'function'
          ? locks.request('padelpulse-auth-logout', execute)
          : execute();

      logoutInFlight = run.finally(() => {
        if (logoutInFlight === run) logoutInFlight = null;
      });
      return logoutInFlight;
    },
    updateUser: (user) => {
      try {
        localStorage.setItem('user', JSON.stringify(user));
        set({ user });
        
        if (user.language) {
          const langCode = extractLanguageCode(user.language);
          i18n.changeLanguage(langCode);
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

