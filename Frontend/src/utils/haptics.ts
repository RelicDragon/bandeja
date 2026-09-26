import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { lightHaptic } from './lightHaptic';

/*
 * Scoring feedback. Native builds shipped before the Haptics plugin was added
 * reject the call as unimplemented; those (and the web) fall back to the
 * short vibration, which is a no-op where unsupported.
 */
const runNative = (call: () => Promise<void>) => {
  if (!Capacitor.isNativePlatform()) {
    lightHaptic();
    return;
  }
  call().catch(() => lightHaptic());
};

/** A value was picked (keypad number, player placed). */
export function hapticSelection(): void {
  runNative(() => Haptics.impact({ style: ImpactStyle.Light }));
}

/** A score or lineup was saved. */
export function hapticSuccess(): void {
  runNative(() => Haptics.notification({ type: NotificationType.Success }));
}
