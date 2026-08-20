import { describe, expect, it } from 'vitest';
import { ChatSyncEventType } from '@bandeja/chat-contract';
import type { ChatMessage } from '@/api/chat';
import { isSyncEventApplied, seqApplyDecisionsForEvents } from './chatSyncEventApplyStatus';
import type { ChatSyncEventDTO } from './chatSyncEventTypes';

function imageMessage(id: string, urls: string[]): ChatMessage {
  return {
    id,
    chatContextType: 'USER',
    contextId: 'u1',
    senderId: 's1',
    content: '',
    mediaUrls: urls,
    thumbnailUrls: urls,
    mentionIds: [],
    state: 'SENT',
    chatType: 'PUBLIC',
    messageType: 'IMAGE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    sender: null,
    reactions: [],
    readReceipts: [],
  };
}

function event(
  seq: number,
  eventType: string,
  payload: unknown
): ChatSyncEventDTO {
  return {
    id: `ev-${seq}`,
    seq,
    eventType,
    payload,
    createdAt: '2026-01-01T00:00:00Z',
  };
}

describe('isSyncEventApplied', () => {
  it('skips MESSAGE_CREATED when the image was not persisted', () => {
    const created = event(10, ChatSyncEventType.MESSAGE_CREATED, {
      message: imageMessage('photo-1', ['https://cdn.example/a.jpg']),
    });
    expect(isSyncEventApplied(created, new Map())).toBe(false);
  });

  it('skips MESSAGE_CREATED when only a media tombstone was persisted', () => {
    const full = imageMessage('photo-1', ['https://cdn.example/a.jpg']);
    const created = event(10, ChatSyncEventType.MESSAGE_CREATED, { message: full });
    const tombstone = imageMessage('photo-1', []);
    expect(isSyncEventApplied(created, new Map([['photo-1', tombstone]]))).toBe(false);
  });

  it('applies MESSAGE_CREATED when the image row was persisted', () => {
    const full = imageMessage('photo-1', ['https://cdn.example/a.jpg']);
    const created = event(10, ChatSyncEventType.MESSAGE_CREATED, { message: full });
    expect(isSyncEventApplied(created, new Map([['photo-1', full]]))).toBe(true);
  });

  it('treats non-create events as applied so 325 can specialize deletes', () => {
    const deleted = event(11, ChatSyncEventType.MESSAGE_DELETED, { messageId: 'm-del' });
    expect(isSyncEventApplied(deleted, new Map())).toBe(true);
  });
});

describe('seqApplyDecisionsForEvents', () => {
  it('marks unpersisted image creates as skipped', () => {
    const full = imageMessage('photo-1', ['https://cdn.example/a.jpg']);
    const decisions = seqApplyDecisionsForEvents(
      [event(10, ChatSyncEventType.MESSAGE_CREATED, { message: full })],
      []
    );
    expect(decisions).toEqual([{ seq: 10, applied: false }]);
  });
});
