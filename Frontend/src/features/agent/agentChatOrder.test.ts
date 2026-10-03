import { describe, expect, it } from 'vitest';
import type { AgentChatDto } from '@shared/agentContract';
import { sortAgentChats, withAgentChatPinned, withoutAgentChat } from './agentChatOrder';

const chat = (id: string, updatedAt: string, pinnedAt: string | null = null): AgentChatDto => ({
  id,
  title: id,
  lastMessagePreview: null,
  activeRun: null,
  pinnedAt,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt,
});

describe('sortAgentChats', () => {
  it('puts pinned chats first, most recently pinned on top, then the rest by activity', () => {
    const sorted = sortAgentChats([
      chat('old', '2026-10-01T10:00:00.000Z'),
      chat('pinA', '2026-09-01T10:00:00.000Z', '2026-10-02T10:00:00.000Z'),
      chat('new', '2026-10-03T10:00:00.000Z'),
      chat('pinB', '2026-09-02T10:00:00.000Z', '2026-10-02T12:00:00.000Z'),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(['pinB', 'pinA', 'new', 'old']);
  });

  it('treats a missing pinnedAt (older servers) as not pinned', () => {
    const legacy = { ...chat('legacy', '2026-10-03T10:00:00.000Z') };
    delete legacy.pinnedAt;
    const sorted = sortAgentChats([legacy, chat('pin', '2026-09-01T10:00:00.000Z', '2026-10-01T10:00:00.000Z')]);
    expect(sorted.map((c) => c.id)).toEqual(['pin', 'legacy']);
  });
});

describe('withAgentChatPinned', () => {
  it('pins a row to the top and unpins it back into activity order', () => {
    const list = [chat('a', '2026-10-03T10:00:00.000Z'), chat('b', '2026-10-01T10:00:00.000Z')];
    const pinned = withAgentChatPinned(list, 'b', true, new Date('2026-10-03T12:00:00.000Z'));
    expect(pinned.map((c) => c.id)).toEqual(['b', 'a']);
    expect(pinned[0].pinnedAt).toBe('2026-10-03T12:00:00.000Z');
    expect(withAgentChatPinned(pinned, 'b', false).map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('withoutAgentChat', () => {
  it('drops the row and moves the archived total, never below zero', () => {
    const list = { chats: [chat('a', '2026-10-03T10:00:00.000Z'), chat('b', '2026-10-01T10:00:00.000Z')], archivedCount: 0 };
    const archived = withoutAgentChat(list, 'a', 1);
    expect(archived.chats.map((c) => c.id)).toEqual(['b']);
    expect(archived.archivedCount).toBe(1);
    expect(withoutAgentChat(list, 'b', -1).archivedCount).toBe(0);
  });
});
