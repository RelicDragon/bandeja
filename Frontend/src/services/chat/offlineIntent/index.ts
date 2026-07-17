import { requestChatOfflineBackgroundSync } from '../chatBackgroundSyncRegister';
import { flushOfflineIntents } from './flush';
import * as mutationAdapter from './mutationAdapter';
import * as outboxAdapter from './outboxAdapter';
import type { FlushOfflineIntentOptions, OfflineIntentContext, OfflineIntentPayload, OfflineIntentStatus } from './types';

export type {
  ChatMarkReadMutationPayload,
  FlushOfflineIntentOptions,
  OfflineDeleteIntent,
  OfflineEditIntent,
  OfflineIntentContext,
  OfflineLinkPreviewIntent,
  OfflineIntentPayload,
  OfflineIntentSource,
  OfflineIntentStatus,
  OfflineMarkReadBatchIntent,
  OfflinePinIntent,
  OfflineReactionAddIntent,
  OfflineReactionRemoveIntent,
  OfflineSendIntent,
  OfflineUnpinIntent,
  PendingOfflineIntent,
} from './types';

let scheduleTimer: ReturnType<typeof setTimeout> | null = null;

function isMutationIntent(kind: OfflineIntentPayload['kind']): boolean {
  return kind !== 'send';
}

async function dispatchEnqueue(intent: OfflineIntentPayload): Promise<void> {
  switch (intent.kind) {
    case 'send':
      await outboxAdapter.enqueueSend(intent.queued);
      return;
    case 'edit':
      await mutationAdapter.enqueueEdit(intent);
      return;
    case 'delete':
      await mutationAdapter.enqueueDelete(intent);
      return;
    case 'reaction_add':
      await mutationAdapter.enqueueReactionAdd(intent);
      return;
    case 'reaction_remove':
      await mutationAdapter.enqueueReactionRemove(intent);
      return;
    case 'pin':
      await mutationAdapter.enqueuePin(intent);
      return;
    case 'unpin':
      await mutationAdapter.enqueueUnpin(intent);
      return;
    case 'link_preview':
      await mutationAdapter.enqueueLinkPreview(intent);
      return;
    case 'mark_read_batch':
      await mutationAdapter.enqueueMarkReadBatch(intent);
      return;
    default: {
      const _exhaustive: never = intent;
      throw new Error(`unknown offline intent ${_exhaustive}`);
    }
  }
}

export const OfflineIntent = {
  async enqueue(intent: OfflineIntentPayload): Promise<void> {
    await dispatchEnqueue(intent);
    if (isMutationIntent(intent.kind)) {
      OfflineIntent.scheduleFlush();
    }
  },

  async flush(options?: FlushOfflineIntentOptions): Promise<void> {
    await flushOfflineIntents(options);
  },

  scheduleFlush(): void {
    requestChatOfflineBackgroundSync();
    if (scheduleTimer) clearTimeout(scheduleTimer);
    scheduleTimer = setTimeout(() => {
      scheduleTimer = null;
      void flushOfflineIntents();
    }, 320);
  },

  async status(context: OfflineIntentContext): Promise<OfflineIntentStatus> {
    const [failedSends, failedMutations] = await Promise.all([
      outboxAdapter.countFailedOutboxForContext(context.contextType, context.contextId),
      mutationAdapter.countFailedMutationsForContext(context.contextType, context.contextId),
    ]);
    return { failedSends, failedMutations };
  },
};

export async function flushAllChatOfflineQueues(): Promise<void> {
  await OfflineIntent.flush();
}

export function scheduleUnifiedChatOfflineFlush(): void {
  OfflineIntent.scheduleFlush();
}
