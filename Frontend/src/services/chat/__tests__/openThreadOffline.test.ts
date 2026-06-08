import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessageWithStatus } from '@/api/chat';
import { openThread } from '../threadOpen/openThread';

vi.mock('@/services/chat/chatOpenPrefetch', () => ({
  prefetchOpenThreadLocal: vi.fn(async () => []),
}));

vi.mock('@/services/chat/chatLocalApply', () => ({
  bridgeGetLastMessageId: vi.fn(() => null),
  loadLocalThreadBootstrap: vi.fn(async () => ({ messages: [] })),
}));

vi.mock('@/services/chat/messageContextHead', () => ({
  hydrateLastMessageIdFromDexieIfMissing: vi.fn(async () => {}),
}));

vi.mock('@/services/chat/chatThreadScroll', () => ({
  getThreadScrollState: vi.fn(async () => undefined),
}));

function msg(id: string): ChatMessageWithStatus {
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
    createdAt: '2026-01-03T10:00:00Z',
    updatedAt: '2026-01-03T10:00:00Z',
    sender: null,
    reactions: [],
    readReceipts: [],
  };
}

describe('openThread offline', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { loadLocalThreadBootstrap } = await import('@/services/chat/chatLocalApply');
    vi.mocked(loadLocalThreadBootstrap).mockResolvedValue({ messages: [] });
  });

  it('paints from dexie without network', async () => {
    const { loadLocalThreadBootstrap } = await import('@/services/chat/chatLocalApply');
    vi.mocked(loadLocalThreadBootstrap).mockResolvedValue({
      messages: [msg('local-1')],
    });

    const outcome = await openThread({
      contextType: 'GAME',
      contextId: 'g1',
      chatType: 'PUBLIC',
      threadKey: 'GAME:g1:PUBLIC',
      prev: [],
      peekL1: () => [],
    });

    expect(outcome.kind).toBe('painted');
    if (outcome.kind === 'painted') {
      expect(outcome.result.plan.messages.map((m) => m.id)).toEqual(['local-1']);
    }
  });

  it('falls back to network when no local cache', async () => {
    const outcome = await openThread({
      contextType: 'GAME',
      contextId: 'g1',
      chatType: 'PUBLIC',
      threadKey: 'GAME:g1:PUBLIC',
      prev: [],
      peekL1: () => [],
    });

    expect(outcome).toEqual({ kind: 'network-fallback', mergedPrev: [] });
  });
});
