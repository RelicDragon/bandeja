import { describe, expect, it } from 'vitest';
import type { ChatMessageWithStatus } from '@/api/chat';
import { CHAT_LOCAL_THREAD_WINDOW_SIZE } from '@/services/chat/chatLocalApplyThreadLoad';
import { openThreadBootstrap } from '../chatOpenCoordinator';
import { mergeThreadOpenRows, planThreadOpen } from '../threadOpen/planThreadOpen';

function msg(id: string, createdAt: string, extra?: Partial<ChatMessageWithStatus>): ChatMessageWithStatus {
  return {
    id,
    chatContextType: 'GAME',
    contextId: 'g1',
    senderId: 'u1',
    content: id,
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

function optimistic(id: string, createdAt: string): ChatMessageWithStatus {
  return msg(id, createdAt, { _optimisticId: `opt-${id}`, _status: 'SENDING' });
}

describe('mergeThreadOpenRows', () => {
  it('coalesces l1 + dexieTail + outbox to paintGeneration 1', () => {
    const l1 = [msg('l1', '2026-01-03T10:00:00Z')];
    const dexieTail = [msg('d0', '2026-01-03T09:00:00Z'), msg('l1', '2026-01-03T10:00:00Z')];
    const outbox = [optimistic('opt', '2026-01-03T10:02:00Z')];
    const merged = mergeThreadOpenRows({
      l1,
      dexieTail,
      outbox,
      prev: [],
      l1Fresh: true,
    });
    expect(merged.paintGeneration).toBe(1);
    expect(merged.paintSource).toBe('l1');
    expect(merged.rows.map((m) => m.id)).toEqual(['l1', 'opt']);
  });

  it('strips L1 optimistics; outbox still merged (A2.4)', () => {
    const l1 = [msg('m1', '2026-01-03T10:00:00Z'), optimistic('m2', '2026-01-03T10:01:00Z')];
    const outbox = [optimistic('m2', '2026-01-03T10:01:00Z')];
    const merged = mergeThreadOpenRows({
      l1,
      dexieTail: [],
      outbox,
      prev: [],
      l1Fresh: true,
    });
    expect(merged.rows.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(merged.paintGeneration).toBe(1);
  });

  it('applies outbox after L1/Dexie base pick', () => {
    const dexieTail = [msg('m1', '2026-01-03T10:00:00Z')];
    const outbox = [optimistic('m2', '2026-01-03T10:01:00Z')];
    const merged = mergeThreadOpenRows({
      l1: [],
      dexieTail,
      outbox,
      prev: [],
      l1Fresh: false,
    });
    expect(merged.rows.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(merged.paintSource).toBe('dexie-tail');
  });

  it('prefers fresh L1 over Dexie tail (gameChatOpenPerformance parity)', () => {
    const l1 = [msg('l1', '2026-01-03T10:00:00Z')];
    const dexieTail = [msg('d1', '2026-01-03T09:00:00Z')];
    const merged = mergeThreadOpenRows({
      l1,
      dexieTail,
      outbox: [],
      prev: [],
      l1Fresh: true,
    });
    expect(merged.rows.map((m) => m.id)).toEqual(['l1']);
    expect(merged.paintSource).toBe('l1');
  });

  it('dexie-only base respects bootstrap window size invariant', () => {
    const dexieTail = Array.from({ length: CHAT_LOCAL_THREAD_WINDOW_SIZE }, (_, i) =>
      msg(`m${i}`, `2026-01-03T10:${String(i).padStart(2, '0')}:00Z`)
    );
    const merged = mergeThreadOpenRows({
      l1: [],
      dexieTail,
      outbox: [],
      prev: [],
      l1Fresh: false,
    });
    expect(merged.rows.length).toBe(CHAT_LOCAL_THREAD_WINDOW_SIZE);
    expect(merged.paintGeneration).toBe(1);
  });
});

describe('planThreadOpen / openThreadBootstrap peekPrev', () => {
  it('reads prev after async loads so sends during bootstrap stay in snapshot', async () => {
    const dexieTail = [msg('m1', '2026-01-03T10:00:00Z')];
    let prevRows: ChatMessageWithStatus[] = [];
    const inputs = {
      peekL1: () => [] as ChatMessageWithStatus[],
      peekPrev: () => prevRows,
      loadBootstrap: async () => {
        prevRows = [optimistic('opt-mid', '2026-01-03T10:01:00Z')];
        return { messages: dexieTail };
      },
    };

    const direct = await planThreadOpen('GAME:g1:PUBLIC', inputs);
    expect(direct.kind).toBe('painted');
    if (direct.kind !== 'painted') return;
    expect(direct.paintGeneration).toBe(1);
    expect(direct.rows.map((m) => m.id)).toEqual(['m1', 'opt-mid']);

    const viaCoordinator = await openThreadBootstrap({ threadKey: 'GAME:g1:PUBLIC', ...inputs });
    expect(viaCoordinator.kind).toBe('painted');
    if (viaCoordinator.kind !== 'painted') return;
    expect(viaCoordinator.plan.messages.map((m) => m.id)).toEqual(['m1', 'opt-mid']);
  });

  it('returns empty with paintGeneration 0 when no local data', async () => {
    const result = await planThreadOpen('GAME:g1:PUBLIC', {
      peekL1: () => [],
      peekPrev: () => [],
      loadBootstrap: async () => ({ messages: [] }),
    });
    expect(result).toEqual({ kind: 'empty', paintGeneration: 0 });
  });
});
