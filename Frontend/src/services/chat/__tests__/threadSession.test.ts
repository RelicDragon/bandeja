import { describe, expect, it } from 'vitest';
import type { ChatMessageWithStatus } from '@/api/chat';
import {
  mergeChatTypeSwitchPaint,
  messagesBelongToThreadKey,
  pendingOptimisticsForChatTypeSwitch,
  planChatTypeSwitch,
  planLayoutSeed,
  planThreadTeardown,
  resolvePaintScrollPlan,
  resolveSessionScroll,
  resolveThreadKey,
  shouldForceFreshOpen,
  shouldSkipLayoutSeed,
} from '../threadSession';

function msg(
  id: string,
  chatType: 'PUBLIC' | 'PRIVATE' = 'PUBLIC',
  extra?: Partial<ChatMessageWithStatus>
): ChatMessageWithStatus {
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
    chatType,
    createdAt: '2026-01-03T10:00:00Z',
    updatedAt: '2026-01-03T10:00:00Z',
    sender: null,
    reactions: [],
    readReceipts: [],
    ...extra,
  };
}

describe('resolveThreadKey', () => {
  it('includes chat type for GAME threads', () => {
    expect(resolveThreadKey('GAME', 'g1', 'PRIVATE')).toBe('GAME:g1:PRIVATE');
    expect(resolveThreadKey('USER', 'u1')).toBe('USER:u1');
  });
});

describe('planLayoutSeed — open/bootstrap', () => {
  it('clears visible and seeds warm ref when thread key changes', () => {
    const plan = planLayoutSeed({
      threadKey: 'GAME:g2:PUBLIC',
      previousThreadKey: 'GAME:g1:PUBLIC',
      seededThreadKey: 'GAME:g1:PUBLIC',
      forceFreshOpen: false,
      warmCache: [msg('g2-only')],
    });
    expect(plan.clearVisible).toBe(true);
    expect(plan.warmRefMessages.map((m) => m.id)).toEqual(['g2-only']);
    expect(plan.flushOnUnmountKey).toBe('GAME:g1:PUBLIC');
    expect(plan.invalidateOpen).toBe(true);
  });

  it('skips re-seed when same key and no force reload', () => {
    const plan = planLayoutSeed({
      threadKey: 'GAME:g1:PUBLIC',
      previousThreadKey: 'GAME:g1:PUBLIC',
      seededThreadKey: 'GAME:g1:PUBLIC',
      forceFreshOpen: false,
      warmCache: [msg('stale')],
    });
    expect(plan.clearVisible).toBe(false);
    expect(shouldSkipLayoutSeed('GAME:g1:PUBLIC', 'GAME:g1:PUBLIC', false)).toBe(true);
  });

  it('re-seeds on force reload for same key', () => {
    expect(shouldForceFreshOpen(1, 0)).toBe(true);
    const plan = planLayoutSeed({
      threadKey: 'GAME:g1:PUBLIC',
      previousThreadKey: 'GAME:g1:PUBLIC',
      seededThreadKey: 'GAME:g1:PUBLIC',
      forceFreshOpen: true,
      warmCache: [],
    });
    expect(plan.clearVisible).toBe(true);
    expect(plan.deleteWarmCache).toBe(true);
  });
});

describe('planChatTypeSwitch — explicit teardown', () => {
  it('returns empty visible and new thread key', () => {
    const plan = planChatTypeSwitch({
      contextType: 'GAME',
      contextId: 'g1',
      toChatType: 'PRIVATE',
    });
    expect(plan.nextThreadKey).toBe('GAME:g1:PRIVATE');
    expect(plan.clearedVisible).toEqual([]);
    expect(plan.teardown).toEqual(planThreadTeardown());
  });

  it('drops prior PUBLIC sent rows on PRIVATE switch merge', () => {
    const publicSent = [msg('p1', 'PUBLIC'), msg('p2', 'PUBLIC')];
    const privateLocal = [msg('pr1', 'PRIVATE')];
    const merged = mergeChatTypeSwitchPaint(publicSent, privateLocal, 'GAME', 'PRIVATE');
    expect(merged.map((m) => m.id)).toEqual(['pr1']);
    expect(messagesBelongToThreadKey(merged, 'GAME:g1:PRIVATE')).toBe(true);
    expect(messagesBelongToThreadKey(publicSent, 'GAME:g1:PUBLIC')).toBe(true);
    expect(messagesBelongToThreadKey(publicSent, 'GAME:g1:PRIVATE')).toBe(false);
  });

  it('keeps pending optimistics for target chat type only', () => {
    const prev = [
      msg('p1', 'PUBLIC'),
      msg('opt-private', 'PRIVATE', { _optimisticId: 'o1', _status: 'SENDING' }),
      msg('opt-public', 'PUBLIC', { _optimisticId: 'o2', _status: 'SENDING' }),
    ];
    expect(pendingOptimisticsForChatTypeSwitch(prev, 'GAME', 'PRIVATE').map((m) => m.id)).toEqual([
      'opt-private',
    ]);
  });

  it('preserves target-type pending optimistics after teardown clear (capture-before-teardown)', () => {
    const beforeTeardown = [
      msg('p1', 'PUBLIC'),
      msg('opt-private', 'PRIVATE', { _optimisticId: 'o1', _status: 'SENDING' }),
    ];
    const clearedVisible: ChatMessageWithStatus[] = [];
    const local = [msg('pr1', 'PRIVATE')];
    const merged = mergeChatTypeSwitchPaint(beforeTeardown, local, 'GAME', 'PRIVATE');
    expect(clearedVisible).toEqual([]);
    expect(merged.map((m) => m.id)).toEqual(['opt-private', 'pr1']);
  });
});

describe('resolveSessionScroll', () => {
  it('prefers open anchor over stored scroll', () => {
    expect(
      resolveSessionScroll({
        storedAnchorMessageId: 'stored',
        openAnchorMessageId: 'push',
        forceFreshOpen: false,
      })
    ).toEqual({ anchorMessageId: 'push' });
  });

  it('pins bottom on force reload', () => {
    expect(
      resolveSessionScroll({
        storedAnchorMessageId: 'mid',
        openAnchorMessageId: 'mid',
        forceFreshOpen: true,
      })
    ).toEqual({ atBottom: true });
  });
});

describe('resolvePaintScrollPlan', () => {
  it('ignores stored scroll on force reload', () => {
    expect(
      resolvePaintScrollPlan({
        messages: [msg('m1')],
        storedScroll: { anchorMessageId: 'mid' },
        forceFreshOpen: true,
      })
    ).toEqual({ atBottom: true });
  });

  it('uses deep-link anchor when message is in snapshot', () => {
    expect(
      resolvePaintScrollPlan({
        messages: [msg('m1'), msg('target')],
        storedScroll: { anchorMessageId: 'stored' },
        forceFreshOpen: false,
        openAnchorMessageId: 'target',
      })
    ).toEqual({ anchorMessageId: 'target' });
  });

  it('falls back to stored scroll when no open anchor in snapshot', () => {
    expect(
      resolvePaintScrollPlan({
        messages: [msg('m1')],
        storedScroll: { anchorMessageId: 'stored' },
        forceFreshOpen: false,
        openAnchorMessageId: 'missing',
      })
    ).toEqual({ anchorMessageId: 'stored' });
  });
});
