import { offlineIntentContextKey } from './contextKey';
import {
  canFlushMutations,
  dispatchMutationFlushDone,
  flushMutationIntent,
  listPendingMutationIntents,
} from './mutationAdapter';
import { flushOutboxIntent, listPendingOutboxIntents } from './outboxAdapter';
import type { FlushOfflineIntentOptions, PendingOfflineIntent } from './types';

const OFFLINE_INTENT_FLUSH_LOCK = 'bandeja-chat-unified-offline-flush-v1';

let flushRunning = false;

function runWithOfflineIntentFlushLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : null;
  if (locks?.request) {
    return new Promise((resolve, reject) => {
      void locks.request(OFFLINE_INTENT_FLUSH_LOCK, { mode: 'exclusive' }, async () => {
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        }
      });
    });
  }
  return fn();
}

function groupByThread(intents: PendingOfflineIntent[]): Map<string, PendingOfflineIntent[]> {
  const byThread = new Map<string, PendingOfflineIntent[]>();
  for (const intent of intents) {
    const key = offlineIntentContextKey(intent.contextType, intent.contextId);
    const list = byThread.get(key) ?? [];
    list.push(intent);
    byThread.set(key, list);
  }
  for (const list of byThread.values()) {
    list.sort((a, b) => a.createdAtMs - b.createdAtMs);
  }
  return byThread;
}

async function flushOneIntent(intent: PendingOfflineIntent): Promise<void> {
  if (intent.source === 'outbox') {
    await flushOutboxIntent(intent.id);
    return;
  }
  await flushMutationIntent(intent.id);
}

export async function flushOfflineIntents(options?: FlushOfflineIntentOptions): Promise<void> {
  if (!canFlushMutations()) return;

  await runWithOfflineIntentFlushLock(async () => {
    if (flushRunning) return;
    flushRunning = true;
    try {
      const [outbox, mutations] = await Promise.all([
        listPendingOutboxIntents(options),
        listPendingMutationIntents(),
      ]);
      const byThread = groupByThread([...outbox, ...mutations]);
      for (const threadIntents of byThread.values()) {
        for (const intent of threadIntents) {
          await flushOneIntent(intent);
        }
      }
    } finally {
      flushRunning = false;
      dispatchMutationFlushDone();
    }
  });
}
