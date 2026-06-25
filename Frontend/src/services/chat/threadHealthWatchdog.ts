import type { ChatMessage, ChatMessageWithStatus, ChatContextType } from '@/api/chat';
import type { ChatType } from '@/types';
import { chatOpenMessagesSnapshotEqual, mergeOpenSnapshot } from '@/services/chat/chatOpenSnapshot';
import { readReceiptsFingerprint } from '@/services/chat/readReceiptsFingerprint';
import {
  reduceThreadLiveSnapshot,
  type ThreadLiveConfig,
} from '@/services/chat/threadLiveProjection';

/** Interval between UI vs Dexie divergence checks while a thread is open. */
export const THREAD_HEALTH_WATCHDOG_INTERVAL_MS = 5_000;

export type ThreadHealthDivergence = {
  uiCount: number;
  expectedCount: number;
  missingInUi: string[];
  extraInUi: string[];
  receiptMismatches: string[];
};

export function buildThreadLiveConfig(
  contextType: ChatContextType,
  contextId: string,
  viewerUserId: string,
  gameChatType?: ChatType
): ThreadLiveConfig {
  return {
    contextType,
    contextId,
    viewerUserId,
    gameChatTypeFilter: contextType === 'GAME' ? gameChatType : undefined,
  };
}

/** Project what open UI should look like after merging Dexie tail — mirrors reconcileAfterPaint. */
export function projectUiFromDexieTail(
  uiMessages: readonly ChatMessageWithStatus[],
  dexieTail: readonly ChatMessage[],
  config: ThreadLiveConfig
): ChatMessageWithStatus[] {
  if (dexieTail.length === 0) return [...uiMessages];

  const merged = mergeOpenSnapshot(uiMessages, dexieTail, []);
  let projected = reduceThreadLiveSnapshot(
    uiMessages,
    [{ type: 'hydrateSnapshot', messages: merged }],
    config
  ).next;

  if (projected.length < uiMessages.length) {
    projected = mergeOpenSnapshot(uiMessages, projected, []);
  }

  return projected;
}

export function summarizeThreadHealthDivergence(
  uiMessages: readonly ChatMessageWithStatus[],
  expectedMessages: readonly ChatMessageWithStatus[]
): ThreadHealthDivergence {
  const uiIds = new Set(uiMessages.map((m) => m.id));
  const expectedIds = new Set(expectedMessages.map((m) => m.id));
  const expectedById = new Map(expectedMessages.map((m) => [m.id, m]));

  const missingInUi = [...expectedIds].filter((id) => !uiIds.has(id)).slice(0, 10);
  const extraInUi = [...uiIds].filter((id) => !expectedIds.has(id)).slice(0, 10);
  const receiptMismatches: string[] = [];

  for (const message of uiMessages) {
    const expected = expectedById.get(message.id);
    if (!expected) continue;
    if (
      readReceiptsFingerprint(message.readReceipts) !==
      readReceiptsFingerprint(expected.readReceipts)
    ) {
      receiptMismatches.push(message.id);
    }
  }

  return {
    uiCount: uiMessages.length,
    expectedCount: expectedMessages.length,
    missingInUi,
    extraInUi,
    receiptMismatches: receiptMismatches.slice(0, 10),
  };
}

export function detectThreadUiDexieDivergence(
  uiMessages: readonly ChatMessageWithStatus[],
  dexieTail: readonly ChatMessage[],
  config: ThreadLiveConfig
): ThreadHealthDivergence | null {
  if (dexieTail.length === 0) return null;

  const expected = projectUiFromDexieTail(uiMessages, dexieTail, config);
  if (chatOpenMessagesSnapshotEqual(uiMessages, expected)) return null;

  return summarizeThreadHealthDivergence(uiMessages, expected);
}

export function logThreadHealthDivergence(
  threadKey: string,
  divergence: ThreadHealthDivergence
): void {
  console.warn('[bandeja-chat] thread health divergence', { threadKey, ...divergence });
}
