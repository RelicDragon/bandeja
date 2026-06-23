import { notifyAppShellReadyToNative } from '@/services/authBridge';

export const BOOT_SPLASH_BG = '#abdee3';

export function dismissHtmlBootSplash(): void {
  document.getElementById('boot-splash')?.remove();
}

export function markAppReady(): void {
  document.documentElement.classList.add('app-ready');
}

export function notifyShellPainted(): void {
  dismissHtmlBootSplash();
  void notifyAppShellReadyToNative();
}
