import { describe, expect, it, vi } from 'vitest';
import type { ChatOutboxRow } from './chatLocalDb';

vi.mock('./chatOutboxMediaBlobs', () => ({
  loadOutboxImageBlobs: vi.fn(),
  loadOutboxVideoBlob: vi.fn(),
  loadOutboxVoiceBlob: vi.fn(),
  loadOutboxVideoPosterBlob: vi.fn(),
}));

vi.mock('@/services/chatMessageQueueStorage', () => ({
  messageQueueStorage: {
    remove: vi.fn(),
  },
}));

vi.mock('@/services/chatSendService', () => ({
  cancelSend: vi.fn(),
}));

vi.mock('./chatOutboxEvents', () => ({
  dispatchChatOutboxRemoved: vi.fn(),
  dispatchChatOutboxSuccess: vi.fn(),
}));

vi.mock('./chatDiagnostics', () => ({
  logChatOutboxBlobMismatch: vi.fn(),
}));

vi.mock('@/api/chat', () => ({
  chatApi: {},
}));

vi.mock('./chatLocalDb', () => ({
  chatLocalDb: {
    messages: { where: vi.fn() },
  },
}));

import { outboxRowHasLocalMediaBlobs, reconcileUnsendableOutboxRow } from './chatOutboxReconcile';

function stickerOutboxRow(overrides: Partial<ChatOutboxRow> = {}): ChatOutboxRow {
  return {
    tempId: 'opt-sticker-1',
    contextType: 'GAME',
    contextId: 'game-1',
    payload: {
      content: '',
      mediaUrls: [],
      thumbnailUrls: [],
      chatType: 'PUBLIC',
      mentionIds: [],
      messageType: 'STICKER',
      stickerId: 'sticker-abc',
      stickerEmoji: '🎾',
    },
    createdAt: new Date().toISOString(),
    status: 'queued',
    clientMutationId: 'cid-1',
    ...overrides,
  };
}

describe('sticker outbox (issue 300)', () => {
  it('treats sticker rows as create-only (no local media blobs required)', async () => {
    await expect(outboxRowHasLocalMediaBlobs(stickerOutboxRow())).resolves.toBe(true);
  });

  it('keeps sticker rows sendable for offline retry', async () => {
    await expect(reconcileUnsendableOutboxRow(stickerOutboxRow())).resolves.toBe('needs_send');
  });
});

describe('Giphy outbox', () => {
  const row = stickerOutboxRow({
    tempId: 'opt-giphy-1',
    payload: {
      content: '',
      mediaUrls: ['https://media.giphy.com/preview.gif'],
      thumbnailUrls: ['https://media.giphy.com/preview.gif'],
      chatType: 'PUBLIC',
      mentionIds: [],
      messageType: 'IMAGE',
    },
    pendingGiphy: {
      provider: 'GIPHY',
      id: 'gif-1',
      title: 'Padel win',
      previewUrl: 'https://media.giphy.com/preview.gif',
      downloadUrl: 'https://media.giphy.com/original.gif',
      width: 320,
      height: 180,
    },
  });

  it('keeps provider metadata sendable without local blobs', async () => {
    await expect(outboxRowHasLocalMediaBlobs(row)).resolves.toBe(true);
    await expect(reconcileUnsendableOutboxRow(row)).resolves.toBe('needs_send');
  });
});
