import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';

let refcount = 0;
let nativeActive = false;

async function activateNative(): Promise<void> {
  if (!Capacitor.isNativePlatform() || nativeActive) return;
  try {
    await KeepAwake.keepAwake();
    nativeActive = true;
  } catch {
    /* */
  }
}

async function releaseNative(): Promise<void> {
  if (!nativeActive) return;
  nativeActive = false;
  try {
    await KeepAwake.allowSleep();
  } catch {
    /* */
  }
}

export async function acquireChatSendWakeLock(): Promise<void> {
  refcount += 1;
  if (refcount !== 1) return;
  await activateNative();
}

export async function releaseChatSendWakeLock(): Promise<void> {
  if (refcount <= 0) return;
  refcount -= 1;
  if (refcount === 0) await releaseNative();
}

/** Test-only reset */
export function resetChatSendWakeLockForTests(): void {
  refcount = 0;
  nativeActive = false;
}
