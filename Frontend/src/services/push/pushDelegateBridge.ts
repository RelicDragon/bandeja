import { registerPlugin, Capacitor } from '@capacitor/core';

interface BandejaPushDelegatePlugin {
  setPushReplyJsReady(options: { ready: boolean }): Promise<void>;
}

const BandejaPushDelegate = registerPlugin<BandejaPushDelegatePlugin>('BandejaPushDelegate');

export async function setPushReplyJsReadyNative(ready: boolean): Promise<void> {
  if (Capacitor.getPlatform() !== 'ios') return;
  try {
    await BandejaPushDelegate.setPushReplyJsReady({ ready });
  } catch (error) {
    console.warn('[push-reply] failed to sync JS ready state to native', error);
  }
}
