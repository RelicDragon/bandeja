import { Capacitor } from '@capacitor/core';

export type BooktimeSignupPlatform = 'android' | 'ios';

export function resolveBooktimeSignupPlatform(): BooktimeSignupPlatform {
  return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
}
