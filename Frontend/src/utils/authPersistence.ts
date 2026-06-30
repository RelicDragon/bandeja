const AUTH_BACKUP_KEY = 'auth_backup';
const LAST_CHECK_KEY = 'auth_last_check';

import { useAuthStore } from '@/store/authStore';
import { scheduleProactiveAccessRefresh } from '@/api/authRefresh';
import { syncTokenToNative } from '@/services/authBridge';
import {
  clearLocalAuthStorageForExplicitLogout,
  hasExplicitLogoutMarker,
} from '@/utils/authExplicitLogout';
import type { User } from '@/types';

interface AuthBackup {
  token: string;
  user: string;
  timestamp: number;
}

export const backupAuth = (): void => {
  try {
    if (hasExplicitLogoutMarker()) {
      localStorage.removeItem(AUTH_BACKUP_KEY);
      return;
    }

    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    if (token && user) {
      const backup: AuthBackup = {
        token,
        user,
        timestamp: Date.now(),
      };
      localStorage.setItem(AUTH_BACKUP_KEY, JSON.stringify(backup));
      console.log('Auth backed up');
    }
  } catch (error) {
    console.error('Failed to backup auth:', error);
  }
};

export const restoreAuthIfNeeded = (): void => {
  try {
    if (hasExplicitLogoutMarker()) {
      clearLocalAuthStorageForExplicitLogout();
      localStorage.setItem(LAST_CHECK_KEY, Date.now().toString());
      return;
    }

    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    if (!token || !user) {
      const backupStr = localStorage.getItem(AUTH_BACKUP_KEY);
      
      if (backupStr) {
        const backup: AuthBackup = JSON.parse(backupStr);
        const hoursSinceBackup = (Date.now() - backup.timestamp) / (1000 * 60 * 60);
        
        if (hoursSinceBackup < 90 * 24) {
          localStorage.setItem('token', backup.token);
          localStorage.setItem('user', backup.user);
          console.log('Auth restored from backup');
        } else {
          localStorage.removeItem(AUTH_BACKUP_KEY);
          console.log('Auth backup expired');
        }
      }
    }
    
    localStorage.setItem(LAST_CHECK_KEY, Date.now().toString());

    const tokenAfterRestore = localStorage.getItem('token');
    const userAfterRestore = localStorage.getItem('user');
    if (tokenAfterRestore && userAfterRestore && !useAuthStore.getState().isAuthenticated) {
      let user: User | null = null;
      try {
        user = JSON.parse(userAfterRestore) as User;
      } catch {
        user = null;
      }
      if (user) {
        useAuthStore.setState({
          user,
          token: tokenAfterRestore,
          isAuthenticated: true,
        });
        syncTokenToNative(tokenAfterRestore);
        scheduleProactiveAccessRefresh(tokenAfterRestore);
      }
    }
  } catch (error) {
    console.error('Failed to restore auth:', error);
  }
};

let authPersistenceInterval: ReturnType<typeof setInterval> | null = null;
let beforeUnloadHandler: (() => void) | null = null;

export const monitorAuthPersistence = (): (() => void) => {
  if (authPersistenceInterval) {
    return () => {};
  }

  authPersistenceInterval = setInterval(() => {
    backupAuth();
  }, 5 * 60 * 1000);
  
  beforeUnloadHandler = () => {
    backupAuth();
  };
  
  window.addEventListener('beforeunload', beforeUnloadHandler);

  return () => {
    if (authPersistenceInterval) {
      clearInterval(authPersistenceInterval);
      authPersistenceInterval = null;
    }
    if (beforeUnloadHandler) {
      window.removeEventListener('beforeunload', beforeUnloadHandler);
      beforeUnloadHandler = null;
    }
  };
};

