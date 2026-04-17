import { useAuthStore } from '@/store/authStore';

export function handleApiUnauthorizedIfNeeded(): void {
  if (typeof window === 'undefined') return;
  const path = window.location.pathname;
  const isAuthPage =
    path === '/login' ||
    path === '/register' ||
    (path.startsWith('/login/') && path !== '/login/phone' && path !== '/login/telegram');
  const isPublicGamePage = path.startsWith('/games/');
  const isPublicUserProfilePage = path.startsWith('/user-profile/');
  if (!isAuthPage && !isPublicGamePage && !isPublicUserProfilePage) {
    useAuthStore.getState().logout();
  }
}
