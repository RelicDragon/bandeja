/**
 * Regression: open game A chat must never show messages from games B/C.
 * Covers belonging filter hole, L1-exclusive open, and unfiltered L1 put.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import type { ChatMessageWithStatus } from '@/api/chat';
import { liveMessageBelongsToThread, stampMessageThreadContext } from '@/services/chat/liveMessageBelongsToThread';
import { mergeMessagePreservingReceipts } from '@/services/chat/mergeMessagePreservingReceipts';
import {
  filterMessagesBelongingToThreadKey,
  planLayoutSeed,
} from '@/services/chat/threadSession';
import { pickOpenBaseMessages, mergeOpenSnapshot } from '@/services/chat/chatOpenSnapshot';
import { mergeThreadOpenRows } from '@/services/chat/threadOpen/planThreadOpen';
import {
  reduceThreadLiveSnapshot,
  type ThreadLiveConfig,
} from '@/services/chat/threadLiveProjection';
import {
  clearChatThreadMemory,
  peekChatThreadMemory,
  putChatThreadMemory,
} from '@/services/chat/chatThreadMemoryCache';
import { chatSyncTailKey } from '@/utils/chatSyncScope';
import { resetPendingThreadReadReceiptsForTests } from '@/services/chat/pendingThreadReadReceipts';

const MALE = 'cmt5oobrz00tzww657wexllk2';
const WOMEN = 'cmt4ej4dj0lger965u9i6nccw';
const DVE = 'cmta0wbzy0798eg65mm7a2qeb';
const MALE_KEY = chatSyncTailKey('GAME', MALE, 'PUBLIC');

function msg(
  id: string,
  contextId: string,
  content: string,
  extra: Partial<ChatMessageWithStatus> = {}
): ChatMessageWithStatus {
  const createdAt = extra.createdAt ?? '2026-08-25T07:09:51.000Z';
  return {
    id,
    chatContextType: 'GAME',
    contextId,
    senderId: 'u-other',
    content,
    mediaUrls: [],
    thumbnailUrls: [],
    mentionIds: [],
    state: 'SENT',
    chatType: 'PUBLIC',
    createdAt,
    updatedAt: createdAt,
    sender: null,
    reactions: [],
    readReceipts: [],
    ...extra,
  };
}

const maleCfg: ThreadLiveConfig = {
  contextType: 'GAME',
  contextId: MALE,
  viewerUserId: 'andrej',
  gameChatTypeFilter: 'PUBLIC',
};

describe('cross-thread chat leak regression', () => {
  beforeEach(() => {
    resetPendingThreadReadReceiptsForTests();
    clearChatThreadMemory();
  });

  describe('belonging filter', () => {
    it('rejects missing contextId', () => {
      const orphan = msg('orphan', '', 'Извините, девочки');
      delete (orphan as { contextId?: string }).contextId;

      expect(
        liveMessageBelongsToThread(orphan, {
          contextType: 'GAME',
          contextId: MALE,
        })
      ).toBe(false);
    });

    it('hydrateSnapshot drops orphans without contextId', () => {
      const orphan = msg('orphan', '', 'Извините, девочки');
      delete (orphan as { contextId?: string }).contextId;
      const maleOk = msg('male-1', MALE, 'ivan joined');

      const result = reduceThreadLiveSnapshot(
        [orphan],
        [{ type: 'hydrateSnapshot', messages: [orphan, maleOk] }],
        maleCfg
      );

      expect(result.next.map((m) => m.id)).toEqual(['male-1']);
      expect(result.next.some((m) => m.content.includes('девочки'))).toBe(false);
    });
  });

  describe('H2: contextId seal + no stamp-into-live', () => {
    it('stamp never rewrites an existing foreign contextId', () => {
      const women = msg('women-msg', WOMEN, 'Извините, девочки');
      const stamped = stampMessageThreadContext(women, 'GAME', MALE);
      expect(stamped.contextId).toBe(WOMEN);
      expect(
        liveMessageBelongsToThread(stamped, { contextType: 'GAME', contextId: MALE })
      ).toBe(false);
    });

    it('Dexie merge seal keeps first thread scope when rewrite attempted', () => {
      const women = msg('women-msg', WOMEN, 'Извините, девочки');
      const rewritten = msg('women-msg', MALE, 'Извините, девочки');
      const sealed = mergeMessagePreservingReceipts(women, rewritten);
      expect(sealed.contextId).toBe(WOMEN);
      expect(
        liveMessageBelongsToThread(sealed, { contextType: 'GAME', contextId: MALE })
      ).toBe(false);
    });

    it('hydrate of sealed-foreign row still drops via belonging after scrub', () => {
      const foreignKeptWomenId = msg('women-msg', WOMEN, 'Извините, девочки');
      const result = reduceThreadLiveSnapshot(
        [foreignKeptWomenId, msg('m1', MALE, 'ivan')],
        [],
        maleCfg
      );
      expect(result.next.map((m) => m.id)).toEqual(['m1']);
      expect(result.next.some((m) => m.content.includes('девочки'))).toBe(false);
    });
  });

  describe('thread-switch seed', () => {
    it('planLayoutSeed clears visible when switching women → male', () => {
      const womenKey = chatSyncTailKey('GAME', WOMEN, 'PUBLIC');
      const plan = planLayoutSeed({
        threadKey: MALE_KEY,
        previousThreadKey: womenKey,
        seededThreadKey: womenKey,
        forceFreshOpen: false,
        warmCache: [msg('w1', WOMEN, 'девочки')],
      });
      expect(plan.clearVisible).toBe(true);
      const warm = filterMessagesBelongingToThreadKey(plan.warmRefMessages, MALE_KEY);
      expect(warm).toEqual([]);
    });
  });

  describe('open bootstrap', () => {
    it('polluted L1 does not paint foreign messages when threadKey scoped', () => {
      const pollutedL1 = [
        msg('w1', WOMEN, 'Извините, девочки'),
        msg('d1', DVE, 'Marina Trushnikova joined', {
          createdAt: '2026-08-26T12:06:17.000Z',
        }),
      ];
      const correctDexie = [msg('m1', MALE, 'ivan kozlov joined')];

      const merged = mergeThreadOpenRows({
        l1: pollutedL1,
        dexieTail: correctDexie,
        outbox: [],
        prev: [],
        l1Fresh: true,
        threadKey: MALE_KEY,
      });

      expect(merged.rows.some((m) => m.content.includes('девочки'))).toBe(false);
      expect(merged.rows.map((m) => m.id)).toEqual(['m1']);
      expect(merged.paintSource).toBe('dexie-tail');
    });

    it('pickOpenBaseMessages with belonging drops foreign L1 and falls back to Dexie', () => {
      const base = pickOpenBaseMessages({
        l1: [msg('w1', WOMEN, 'девочки')],
        dexieTail: [msg('m1', MALE, 'ivan')],
        l1Fresh: true,
        belonging: { contextType: 'GAME', contextId: MALE },
      });
      expect(base.map((m) => m.id)).toEqual(['m1']);
    });
  });

  describe('reconcile / merge', () => {
    it('every live reduce scrubs foreign rows already in prev', () => {
      const pollutedPrev = [
        msg('w1', WOMEN, 'Извините, девочки'),
        msg('m1', MALE, 'ivan joined'),
      ];
      const result = reduceThreadLiveSnapshot(pollutedPrev, [], maleCfg);
      expect(result.changed).toBe(true);
      expect(result.next.map((m) => m.id)).toEqual(['m1']);
      expect(result.next.some((m) => m.content.includes('девочки'))).toBe(false);
    });

    it('hydrateSnapshot strips foreign contextIds', () => {
      const polluted = [
        msg('w1', WOMEN, 'Извините, девочки'),
        msg('d1', DVE, 'Marina joined'),
        msg('m1', MALE, 'ivan joined'),
      ];
      const result = reduceThreadLiveSnapshot(
        polluted,
        [{ type: 'hydrateSnapshot', messages: polluted }],
        maleCfg
      );
      expect(result.next.map((m) => m.id)).toEqual(['m1']);
    });

    it('mergeOpenSnapshot strips foreign rows when belonging is set', () => {
      const prev = [msg('w1', WOMEN, 'девочки')];
      const dexie = [msg('m1', MALE, 'ivan')];
      const merged = mergeOpenSnapshot(prev, dexie, [], undefined, {
        contextType: 'GAME',
        contextId: MALE,
      });
      expect(merged.map((m) => m.id)).toEqual(['m1']);
    });

    it('mergeOpenSnapshot without belonging still merges (caller must scope)', () => {
      const prev = [msg('w1', WOMEN, 'девочки')];
      const dexie = [msg('m1', MALE, 'ivan')];
      const merged = mergeOpenSnapshot(prev, dexie, []);
      expect(merged.map((m) => m.id).sort()).toEqual(['m1', 'w1']);
    });
  });

  describe('L1 put scoped to thread', () => {
    it('filtered dump into male L1 does not resurface foreign rows on open', () => {
      const pollutedRef = [
        msg('w1', WOMEN, 'Извините, девочки'),
        msg('m1', MALE, 'ivan'),
      ];
      putChatThreadMemory(
        MALE_KEY,
        pollutedRef.filter((m) =>
          liveMessageBelongsToThread(m, { contextType: 'GAME', contextId: MALE })
        )
      );
      const painted = mergeThreadOpenRows({
        l1: peekChatThreadMemory(MALE_KEY),
        dexieTail: [msg('m2', MALE, 'pavel')],
        outbox: [],
        prev: [],
        l1Fresh: true,
        threadKey: MALE_KEY,
      });

      expect(painted.rows.some((m) => m.content.includes('девочки'))).toBe(false);
    });
  });

  describe('video symptom chain', () => {
    it('open must not paint foreign/orphan rows even when L1 is polluted', () => {
      const orphan = msg('orphan-women', '', 'Извините, девочки');
      delete (orphan as { contextId?: string }).contextId;
      const foreignIntact = msg('d1', DVE, 'Marina Trushnikova joined', {
        createdAt: '2026-08-26T12:06:17.000Z',
      });
      const maleOk = msg('m1', MALE, 'ivan kozlov joined');

      putChatThreadMemory(MALE_KEY, [orphan, foreignIntact, maleOk]);
      const firstPaint = mergeThreadOpenRows({
        l1: peekChatThreadMemory(MALE_KEY),
        dexieTail: [maleOk],
        outbox: [],
        prev: [],
        l1Fresh: true,
        threadKey: MALE_KEY,
      });
      expect(firstPaint.rows.map((m) => m.id)).toEqual(['m1']);

      const afterReconcile = reduceThreadLiveSnapshot(
        firstPaint.rows,
        [{ type: 'hydrateSnapshot', messages: [...firstPaint.rows, orphan, foreignIntact] }],
        maleCfg
      );
      expect(afterReconcile.next.map((m) => m.id)).toEqual(['m1']);
    });
  });
});
