import type { User } from '@/types';

export function usesPremiumTheme(user: Pick<User, 'isPremium' | 'mainTheme'> | null | undefined): boolean {
  return user?.isPremium === true && user.mainTheme === 'premium';
}

export function appPageBackground(dark: boolean, premium: boolean): string {
  return premium ? (dark ? '#141411' : '#faf9f6') : (dark ? '#111827' : '#f9fafb');
}

export function syncWebThemeColor(): void {
  const root = document.documentElement;
  const color = root.classList.contains('premium-navigation')
    ? '#11100e'
    : appPageBackground(root.classList.contains('dark'), root.classList.contains('premium-theme'));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
}
