import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();
const mockPut = vi.fn();
const mockDeleteVideoBlobs = vi.fn();
const mockReconcile = vi.fn();

vi.mock('./chat/chatLocalDb', () => ({
  chatLocalDb: {
    outbox: {
      get: (...args: unknown[]) => mockGet(...args),
      put: (...args: unknown[]) => mockPut(...args),
    },
  },
}));

vi.mock('./chat/chatOutboxMediaBlobs', () => ({
  deleteOutboxVideoBlobs: (...args: unknown[]) => mockDeleteVideoBlobs(...args),
}));

vi.mock('./chat/chatThreadIndex', () => ({
  reconcileThreadIndexOutboxForContext: (...args: unknown[]) => mockReconcile(...args),
}));

import { messageQueueStorage } from './chatMessageQueueStorage';

describe('commitPendingVideoUploaded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReconcile.mockResolvedValue(undefined);
    mockDeleteVideoBlobs.mockResolvedValue(undefined);
    mockPut.mockResolvedValue(undefined);
  });

  it('clears video blobs and sets uploaded URLs on payload', async () => {
    const row = {
      tempId: 'opt-v1',
      contextType: 'GAME',
      contextId: 'g1',
      status: 'queued',
      hasPendingVideoBlob: true,
      videoDurationMs: 12_000,
      payload: {
        content: '',
        messageType: 'VIDEO',
        mediaUrls: [],
        thumbnailUrls: [],
        videoDurationMs: 12_000,
        chatType: 'PUBLIC',
      },
      createdAt: new Date().toISOString(),
    };
    mockGet.mockResolvedValue(row);

    await messageQueueStorage.commitPendingVideoUploaded(
      'opt-v1',
      'uploads/chat/videos/v1.mp4',
      'uploads/chat/thumbnails/v1_poster.jpg',
      12_500
    );

    expect(mockDeleteVideoBlobs).toHaveBeenCalledWith('opt-v1');
    expect(mockPut).toHaveBeenCalledWith(
      expect.objectContaining({
        tempId: 'opt-v1',
        hasPendingVideoBlob: undefined,
        mediaUrls: ['uploads/chat/videos/v1.mp4'],
        thumbnailUrls: ['uploads/chat/thumbnails/v1_poster.jpg'],
        payload: expect.objectContaining({
          messageType: 'VIDEO',
          mediaUrls: ['uploads/chat/videos/v1.mp4'],
          thumbnailUrls: ['uploads/chat/thumbnails/v1_poster.jpg'],
          videoDurationMs: 12_500,
        }),
      })
    );
    expect(mockReconcile).toHaveBeenCalledWith('GAME', 'g1');
  });

  it('no-ops when outbox row is missing', async () => {
    mockGet.mockResolvedValue(undefined);
    await messageQueueStorage.commitPendingVideoUploaded('missing', 'v', 't', 1000);
    expect(mockDeleteVideoBlobs).not.toHaveBeenCalled();
    expect(mockPut).not.toHaveBeenCalled();
  });
});
