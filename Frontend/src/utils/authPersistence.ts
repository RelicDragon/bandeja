const AUTH_BACKUP_KEY = 'auth_backup';
const LAST_CHECK_KEY = 'auth_last_check';

interface AuthBackup {
  token: string;
  user: string;
  timestamp: number;
}

export const backupAuth = (): void => {
  try {
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
  } catch (error) {
    console.error('Failed to restore auth:', error);
  }
};

export const monitorAuthPersistence = (): void => {
  setInterval(() => {
    backupAuth();
  }, 5 * 60 * 1000);
  
  window.addEventListener('beforeunload', () => {
    backupAuth();
  });
};


