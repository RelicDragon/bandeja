import type { ChatContextType, ChatMessageWithStatus } from '@/api/chat';
import type { BasicUser, ChatType } from '@/types';
import { bridgeGetLastMessageId, loadLocalThreadBootstrap } from '@/services/chat/chatLocalApply';
import { prefetchOpenThreadLocal } from '@/services/chat/chatOpenPrefetch';
import { buildOutboxOptimisticsForOpen } from '@/services/chat/chatOutboxOpenSnapshot';
import { hydrateLastMessageIdFromDexieIfMissing } from '@/services/chat/messageContextHead';
import { mergeServerPageWithPendingOptimistics } from '@/utils/chatMessageSort';
import { planThreadOpen } from '@/services/chat/threadOpen/planThreadOpen';
import type { ThreadOpenPlanResult } from '@/services/chat/threadOpen/types';

export type ThreadOpenOutboxContext = {
  userId: string;
  user: BasicUser | null;
};

export type ThreadOpenRequest = {
  contextType: ChatContextType;
  contextId: string;
  chatType: ChatType;
  threadKey: string;
  prev: readonly ChatMessageWithStatus[];
  peekL1: () => readonly ChatMessageWithStatus[];
  /** Live row read after async bootstrap loads; defaults to merged prefetch snapshot. */
  peekPrev?: () => readonly ChatMessageWithStatus[];
  outbox?: ThreadOpenOutboxContext;
  forceFreshOpen?: boolean;
  openAnchorMessageId?: string;
};

export type ThreadOpenPaintedOutcome = {
  kind: 'painted';
  mergedPrev: ChatMessageWithStatus[];
  result: Extract<ThreadOpenPlanResult, { kind: 'painted' }>;
};

export type ThreadOpenOutcome =
  | ThreadOpenPaintedOutcome
  | { kind: 'network-fallback'; mergedPrev: ChatMessageWithStatus[] };

async function planDexieTailFallback(
  request: ThreadOpenRequest,
  mergedPrev: ChatMessageWithStatus[]
): Promise<ThreadOpenPaintedOutcome | null> {
  await hydrateLastMessageIdFromDexieIfMissing(
    request.contextType,
    request.contextId,
    request.contextType === 'GAME' ? request.chatType : undefined
  );

  const lastId = bridgeGetLastMessageId(
    request.contextType,
    request.contextId,
    request.contextType === 'GAME' ? request.chatType : undefined
  );
  if (!lastId) return null;

  const bootstrap = await loadLocalThreadBootstrap(
    request.contextType,
    request.contextId,
    request.chatType
  );
  if (bootstrap.messages.length === 0) return null;

  const result = await planThreadOpen(request.threadKey, {
    peekL1: () => [],
    peekPrev: request.peekPrev ?? (() => mergedPrev),
    loadBootstrap: async () => bootstrap,
    forceFreshOpen: request.forceFreshOpen,
    openAnchorMessageId: request.openAnchorMessageId,
  });
  if (result.kind !== 'painted') return null;

  return { kind: 'painted', mergedPrev, result };
}

/** Full thread-open bootstrap: prefetch, L1/Dexie/outbox merge, empty-tail fallback. */
export async function openThread(request: ThreadOpenRequest): Promise<ThreadOpenOutcome> {
  let mergedPrev = [...request.prev];

  const prefetched = await prefetchOpenThreadLocal(
    request.contextType,
    request.contextId,
    request.chatType
  );
  if (prefetched.length > 0) {
    mergedPrev = mergeServerPageWithPendingOptimistics(mergedPrev, prefetched);
  }

  const readPrev = request.peekPrev ?? (() => mergedPrev);
  const result = await planThreadOpen(request.threadKey, {
    peekL1: request.peekL1,
    peekPrev: readPrev,
    loadBootstrap: () =>
      loadLocalThreadBootstrap(request.contextType, request.contextId, request.chatType),
    loadOutboxOptimistics: request.outbox
      ? () =>
          buildOutboxOptimisticsForOpen({
            contextType: request.contextType,
            contextId: request.contextId,
            currentChatType: request.chatType,
            userId: request.outbox!.userId,
            user: request.outbox!.user,
            existingMessages: [...readPrev()],
          }).then((r) => r.optimistics)
      : undefined,
    forceFreshOpen: request.forceFreshOpen,
    openAnchorMessageId: request.openAnchorMessageId,
  });

  if (result.kind === 'painted') {
    return { kind: 'painted', mergedPrev, result };
  }

  const fallback = await planDexieTailFallback(request, mergedPrev);
  if (fallback) return fallback;

  return { kind: 'network-fallback', mergedPrev };
}
