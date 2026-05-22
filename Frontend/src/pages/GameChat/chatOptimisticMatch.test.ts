import { describe, expect, it } from 'vitest';
import type { ChatMessageWithStatus } from '@/api/chat';
import { shouldApplyGameChatMessageDespiteTabMismatch } from './chatOptimisticMatch';

describe('shouldApplyGameChatMessageDespiteTabMismatch', () => {
  it('returns true when own message matches a pending optimistic by clientMutationId', () => {
    const messages: ChatMessageWithStatus[] = [
      {
        id: 'opt-1',
        _status: 'SENDING',
        _optimisticId: 'opt-1',
        _clientMutationId: 'cid-a',
        senderId: 'user-1',
        chatType: 'PRIVATE',
      } as ChatMessageWithStatus,
    ];
    expect(
      shouldApplyGameChatMessageDespiteTabMismatch(
        { senderId: 'user-1', clientMutationId: 'cid-a', chatType: 'PRIVATE' },
        'user-1',
        'PUBLIC',
        messages
      )
    ).toBe(true);
  });

  it('returns false when tab matches and no pending optimistic', () => {
    expect(
      shouldApplyGameChatMessageDespiteTabMismatch(
        { senderId: 'user-1', clientMutationId: 'cid-b', chatType: 'PUBLIC' },
        'user-1',
        'PUBLIC',
        []
      )
    ).toBe(false);
  });
});
