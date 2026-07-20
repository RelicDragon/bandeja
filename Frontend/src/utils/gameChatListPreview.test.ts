import { describe, expect, it } from 'vitest';
import { chatMessageToGameListPreview } from './gameChatListPreview';
import type { ChatMessage } from '@/api/chat';

function base(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm1',
    content: null,
    mediaUrls: [],
    thumbnailUrls: [],
    messageType: 'TEXT',
    stickerId: null,
    stickerEmoji: null,
    chatContextType: 'GAME',
    chatType: 'PUBLIC',
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
    ...overrides,
  } as unknown as ChatMessage;
}

describe('chatMessageToGameListPreview', () => {
  it('emits [TYPE:GIF] for a media-only gif', () => {
    const msg = base({
      messageType: 'IMAGE',
      mediaUrls: ['https://cdn.example/chat/giphy-abc.gif'],
    });
    expect(chatMessageToGameListPreview(msg).preview).toBe('[TYPE:GIF]');
  });

  it('emits [TYPE:MEDIA] for a media-only photo', () => {
    const msg = base({
      messageType: 'IMAGE',
      mediaUrls: ['https://cdn.example/chat/photo.jpg'],
    });
    expect(chatMessageToGameListPreview(msg).preview).toBe('[TYPE:MEDIA]');
  });

  it('falls back to text when a gif has a caption', () => {
    const msg = base({
      messageType: 'IMAGE',
      content: 'look at this',
      mediaUrls: ['https://cdn.example/chat/giphy-abc.gif'],
    });
    expect(chatMessageToGameListPreview(msg).preview).toBe('look at this');
  });

  it('emits [TYPE:STICKER] for stickers (unchanged)', () => {
    const msg = base({ messageType: 'STICKER', stickerEmoji: '🎾' });
    expect(chatMessageToGameListPreview(msg).preview).toBe('[TYPE:STICKER]🎾');
  });
});
