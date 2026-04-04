import { isCapacitor } from '@/utils/capacitor';

let nativeAppIsActive = true;

export function setChatSyncNativeAppActive(active: boolean): void {
  nativeAppIsActive = active;
}

/** Low-priority event pulls defer when the app is not foreground (native) or page hidden (web). */
export function shouldDeferLowPriorityChatSyncPull(): boolean {
  if (isCapacitor()) return !nativeAppIsActive;
  if (typeof document === 'undefined') return false;
  return document.visibilityState !== 'visible';
}
