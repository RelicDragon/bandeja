import { describe, expect, it } from 'vitest';
import type { ChatMessageWithStatus } from '@/api/chat';
import { getMessageSendState } from './messageSendState';

function msg(overrides: Partial<ChatMessageWithStatus>): ChatMessageWithStatus {
  return {
    id: 'm1',
    chatContextType: 'GAME',
    contextId: 'g1',
    senderId: 'u1',
    content: 'hi',
    state: 'SENT',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    reactions: [],
    readReceipts: [],
    ...overrides,
  } as ChatMessageWithStatus;
}

describe('getMessageSendState', () => {
  it('returns sent for normal messages', () => {
    const s = getMessageSendState(msg({}));
    expect(s.uiState).toBe('sent');
    expect(s.isOffline).toBe(false);
  });

  it('returns sending for optimistic rows', () => {
    const s = getMessageSendState(msg({ _status: 'SENDING', _optimisticId: 'opt-1' }));
    expect(s.uiState).toBe('sending');
    expect(s.isSending).toBe(true);
    expect(s.optimisticId).toBe('opt-1');
  });

  it('returns failed for failed optimistic rows', () => {
    const s = getMessageSendState(msg({ _status: 'FAILED', _optimisticId: 'opt-2' }));
    expect(s.uiState).toBe('failed');
    expect(s.isFailed).toBe(true);
  });
});
