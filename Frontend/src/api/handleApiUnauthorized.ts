import { useAuthStore } from '@/store/authStore';

export type HandleApiUnauthorizedOpts = {
  /** Always clear cookies/session (e.g. refresh rotation failed); avoids refresh spam on public routes. */
  forceSessionClear?: boolean;
};

export function handleApiUnauthorizedIfNeeded(opts?: HandleApiUnauthorizedOpts): void {
  if (typeof window === 'undefined') return;
  if (opts?.forceSessionClear) {
    void useAuthStore.getState().logout();
    return;
  }
  const path = window.location.pathname;
  const isAuthPage =
    path === '/login' ||
    path === '/register' ||
    (path.startsWith('/login/') && path !== '/login/phone' && path !== '/login/telegram');
  const isPublicGamePage = path.startsWith('/games/');
  const isPublicUserProfilePage = path.startsWith('/user-profile/');
  if (!isAuthPage && !isPublicGamePage && !isPublicUserProfilePage) {
    void useAuthStore.getState().logout();
  }
}
