import { describe, expect, it } from 'vitest';
import { isEligibleSaveAsStickerMessage } from './saveAsSticker';
import type { ChatMessage } from '@/api/chat';

function msg(partial: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm1',
    content: null,
    messageType: 'IMAGE',
    mediaUrls: ['https://cdn.example.com/uploads/chat/originals/x.png'],
    senderId: 'u1',
    createdAt: new Date().toISOString(),
    ...partial,
  } as ChatMessage;
}

describe('isEligibleSaveAsStickerMessage', () => {
  it('accepts IMAGE with media', () => {
    expect(isEligibleSaveAsStickerMessage(msg({}))).toBe(true);
  });

  it('rejects TEXT / STICKER / empty media / deleted', () => {
    expect(isEligibleSaveAsStickerMessage(msg({ messageType: 'TEXT', mediaUrls: [] }))).toBe(false);
    expect(isEligibleSaveAsStickerMessage(msg({ messageType: 'STICKER', mediaUrls: [] }))).toBe(
      false
    );
    expect(isEligibleSaveAsStickerMessage(msg({ mediaUrls: [] }))).toBe(false);
    expect(isEligibleSaveAsStickerMessage(msg({ deletedAt: new Date().toISOString() }))).toBe(
      false
    );
  });
});
