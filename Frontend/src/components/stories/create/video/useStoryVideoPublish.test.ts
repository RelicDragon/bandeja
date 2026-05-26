import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateStoryItemPayload } from '@/api/stories';

const { createItem, uploadVideo, prepareChatVideoForSend } = vi.hoisted(() => ({
  createItem: vi.fn(),
  uploadVideo: vi.fn(),
  prepareChatVideoForSend: vi.fn(),
}));

vi.mock('@/api/stories', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/stories')>();
  return {
    ...actual,
    storiesApi: {
      ...actual.storiesApi,
      createItem: (...args: unknown[]) => createItem(...args),
      uploadVideo: (...args: unknown[]) => uploadVideo(...args),
      newClientUploadId: () => 'upload-test-id',
    },
  };
});

vi.mock('@/services/chat/chatVideoTranscode', () => ({
  prepareChatVideoForSend: (...args: unknown[]) => prepareChatVideoForSend(...args),
}));

import { buildVideoCreateItemPayload, publishStoryVideoFile } from './useStoryVideoPublish';

function uploadedVideo() {
  return {
    mediaUrl: 'https://cdn.example/v.mp4',
    thumbnailUrl: 'https://cdn.example/v-thumb.jpg',
    posterUrl: 'https://cdn.example/v-poster.jpg',
    durationMs: 12_000,
    width: 1080,
    height: 1920,
  };
}

describe('buildVideoCreateItemPayload', () => {
  it('omits overlayStyle from create payload', () => {
    const payload = buildVideoCreateItemPayload(uploadedVideo(), 'caption', 'cid-1');
    expect(payload.messageType).toBe('VIDEO');
    expect(payload.caption).toBe('caption');
    expect(payload).not.toHaveProperty('overlayStyle');
    expect('overlayStyle' in (payload as CreateStoryItemPayload)).toBe(false);
  });
});

describe('publishStoryVideoFile', () => {
  beforeEach(() => {
    createItem.mockReset();
    uploadVideo.mockReset();
    prepareChatVideoForSend.mockReset();

    prepareChatVideoForSend.mockResolvedValue({
      videoFile: new File(['v'], 'clip.mp4', { type: 'video/mp4' }),
      posterBlob: new Blob(['p'], { type: 'image/jpeg' }),
      durationMs: 12_000,
      width: 1080,
      height: 1920,
    });
    uploadVideo.mockResolvedValue(uploadedVideo());
    createItem.mockResolvedValue({
      key: 'USER_STORY_ITEM:item-1',
      viewed: false,
      createdAt: new Date().toISOString(),
      sourceType: 'USER_STORY_ITEM',
      media: { url: 'x', thumbnailUrl: 'y', type: 'VIDEO' },
    });
  });

  it('calls createItem without overlayStyle', async () => {
    const file = new File(['v'], 'clip.mp4', { type: 'video/mp4' });
    await publishStoryVideoFile(file, { caption: 'hello' });

    expect(createItem).toHaveBeenCalledOnce();
    const payload = createItem.mock.calls[0]![0] as CreateStoryItemPayload;
    expect(payload.messageType).toBe('VIDEO');
    expect(payload.caption).toBe('hello');
    expect(payload).not.toHaveProperty('overlayStyle');
    expect('overlayStyle' in payload).toBe(false);
  });
});
