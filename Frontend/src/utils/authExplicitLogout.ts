export const AUTH_EXPLICIT_LOGOUT_KEY = 'auth_explicit_logout_at';

export function markExplicitLogout(): void {
  try {
    localStorage.setItem(AUTH_EXPLICIT_LOGOUT_KEY, String(Date.now()));
  } catch {
    /* no-op */
  }
}

export function clearExplicitLogoutMarker(): void {
  try {
    localStorage.removeItem(AUTH_EXPLICIT_LOGOUT_KEY);
  } catch {
    /* no-op */
  }
}

export function hasExplicitLogoutMarker(): boolean {
  try {
    return !!localStorage.getItem(AUTH_EXPLICIT_LOGOUT_KEY);
  } catch {
    return false;
  }
}

export function clearLocalAuthStorageForExplicitLogout(): void {
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('auth_backup');
  } catch {
    /* no-op */
  }
}
