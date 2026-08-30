import { App } from '@capacitor/app';
import {
  changeAndroidLauncherIcon,
  type AndroidLauncherIconChangeOptions,
} from '@/services/androidLauncherIconBridge';

let pendingChange: AndroidLauncherIconChangeOptions | null = null;
let listenerRegistration: Promise<void> | null = null;
let changeInFlight: Promise<void> | null = null;
let nativeUiBlockCount = 0;

async function flushPendingChange(): Promise<void> {
  if (nativeUiBlockCount > 0 || changeInFlight || !pendingChange) return;

  const change = pendingChange;
  pendingChange = null;
  const task = changeAndroidLauncherIcon(change).then(() => undefined);
  changeInFlight = task;

  try {
    await task;
  } catch (error) {
    // Keep the latest requested icon. A transient PackageManager/bridge failure can retry the
    // next time the app moves to the background.
    pendingChange ??= change;
    console.warn('Failed to apply queued Android launcher icon:', error);
  } finally {
    if (changeInFlight === task) changeInFlight = null;
  }
}

function ensureBackgroundListener(): Promise<void> {
  if (listenerRegistration) return listenerRegistration;

  listenerRegistration = App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) void flushPendingChange();
  })
    .then(() => undefined)
    .catch((error) => {
      listenerRegistration = null;
      console.warn('Failed to watch Android app state for launcher icon changes:', error);
    });
  return listenerRegistration;
}

/**
 * Android removes a task when the launcher alias in its base intent is disabled. Queue the
 * component switch until a normal background transition so auth and other foreground work are
 * never torn down by an icon update.
 */
export async function scheduleAndroidLauncherIconChange(
  change: AndroidLauncherIconChangeOptions,
): Promise<void> {
  pendingChange = change;
  await ensureBackgroundListener();
}

/**
 * Prevent a system-owned activity (notably the Android permission sheet) from being mistaken for
 * a safe background transition. Releasing the lock deliberately does not flush: the next genuine
 * background transition owns the launcher-component switch.
 */
export function blockAndroidLauncherIconChangesForNativeUi(): () => void {
  nativeUiBlockCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    nativeUiBlockCount = Math.max(0, nativeUiBlockCount - 1);
  };
}
