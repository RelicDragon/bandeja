import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/api/chat';

vi.mock('../chatLocalApplyThreadEvent', () => ({
  applyThreadEvent: vi.fn(async () => 3),
}));

import { applyThreadEvent } from '../chatLocalApplyThreadEvent';
import { putLocalMessage, persistChatMessagesFromApi } from '../chatLocalApplyWrite';

function msg(id: string): ChatMessage {
  return {
    id,
    chatContextType: 'USER',
    contextId: 'u1',
    senderId: 's1',
    content: 'hi',
    state: 'SENT',
    chatType: 'PUBLIC',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    reactions: [],
    readReceipts: [],
  };
}

describe('chatLocalApplyWrite public API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('putLocalMessage routes through applyThreadEvent sendSuccess', async () => {
    const m = msg('m1');
    const rev = await putLocalMessage(m);
    expect(applyThreadEvent).toHaveBeenCalledWith({ kind: 'sendSuccess', message: m });
    expect(rev).toBe(3);
  });

  it('persistChatMessagesFromApi routes through applyThreadEvent httpMessages', async () => {
    const batch = [msg('m1'), msg('m2')];
    const rev = await persistChatMessagesFromApi(batch);
    expect(applyThreadEvent).toHaveBeenCalledWith({ kind: 'httpMessages', messages: batch });
    expect(rev).toBe(3);
  });

  it('persistChatMessagesFromApi no-ops empty batch', async () => {
    const rev = await persistChatMessagesFromApi([]);
    expect(applyThreadEvent).not.toHaveBeenCalled();
    expect(rev).toBe(0);
  });
});
