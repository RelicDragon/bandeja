import { create } from 'zustand';
import { User } from '@/types';
import i18n from '@/i18n/config';
import { extractLanguageCode, detectTimeFormat, detectWeekStart, normalizeLanguageForProfile } from '@/utils/displayPreferences';
import { usersApi } from '@/api';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  setAuth: (user: User, token: string) => Promise<void>;
  setToken: (token: string) => void;
  logout: () => void | Promise<void>;
  updateUser: (user: User) => void;
  finishInitializing: () => void;
}

export const useAuthStore = create<AuthState>((set) => {
  let savedUser = null;
  let savedToken = null;
  
  try {
    const userStr = localStorage.getItem('user');
    const tokenStr = localStorage.getItem('token');
    
    if (tokenStr) {
      savedToken = tokenStr;
      console.log('Token loaded from localStorage');
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
    setAuth: async (user, token) => {
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('token', token);
      set({ user, token, isAuthenticated: true });

      const deviceLocale = navigator.language || 'en-US';
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
    },
    setToken: (token) => {
      try {
        localStorage.setItem('token', token);
        set({ token, isAuthenticated: true });
      } catch (error) {
        console.error('Error saving token to localStorage:', error);
      }
    },
    logout: async () => {
      try {
        const { pushApi } = await import('@/api');
        await pushApi.removeAllTokens();
      } catch {
        // ignore so logout always completes
      }
      try {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        localStorage.removeItem('auth_backup');
        sessionStorage.removeItem('app_navigation_tracked');
        set({ user: null, token: null, isAuthenticated: false });
      } catch (error) {
        console.error('Error clearing auth from localStorage:', error);
      }
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

