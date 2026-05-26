import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MEDIA_ADJUST, STORY_CANVAS_HEIGHT, STORY_CANVAS_WIDTH } from '../types';
import type { CreateStoryItemPayload, StoryDocument } from '../types';

const { createItem, uploadImage, drawScene, ensureDocumentMediaDimensions } = vi.hoisted(() => ({
  createItem: vi.fn(),
  uploadImage: vi.fn(),
  drawScene: vi.fn(),
  ensureDocumentMediaDimensions: vi.fn(),
}));

vi.mock('@/api/stories', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/stories')>();
  return {
    ...actual,
    storiesApi: {
      ...actual.storiesApi,
      createItem: (...args: unknown[]) => createItem(...args),
      uploadImage: (...args: unknown[]) => uploadImage(...args),
      newClientUploadId: () => 'upload-test-id',
    },
  };
});

vi.mock('../utils/drawScene', () => ({
  drawScene: (...args: unknown[]) => drawScene(...args),
}));

vi.mock('../utils/ensureMediaDimensions', () => ({
  ensureDocumentMediaDimensions: (...args: unknown[]) => ensureDocumentMediaDimensions(...args),
}));

import { buildPhotoCreateItemPayload, publishStoryPhotoDocument } from './useStoryPhotoPublish';

function makeDocument(): StoryDocument {
  const mediaId = 'media-1';
  return {
    version: 3,
    canvas: { width: STORY_CANVAS_WIDTH, height: STORY_CANVAS_HEIGHT },
    backgroundId: mediaId,
    nodes: [
      {
        id: mediaId,
        type: 'media',
        mediaType: 'IMAGE',
        source: {
          file: new File(['x'], 'photo.jpg', { type: 'image/jpeg' }),
          previewUrl: 'blob:preview',
          naturalWidth: 1080,
          naturalHeight: 1920,
        },
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        adjust: DEFAULT_MEDIA_ADJUST,
      },
    ],
  };
}

function uploadedImage() {
  return {
    mediaUrl: 'https://cdn.example/i.jpg',
    thumbnailUrl: 'https://cdn.example/i-thumb.jpg',
    width: 1080,
    height: 1920,
  };
}

describe('buildPhotoCreateItemPayload', () => {
  it('omits overlayStyle from create payload', () => {
    const payload = buildPhotoCreateItemPayload(uploadedImage(), 'cap', 'cid-1');
    expect(payload.messageType).toBe('IMAGE');
    expect(payload).not.toHaveProperty('overlayStyle');
    expect('overlayStyle' in (payload as CreateStoryItemPayload)).toBe(false);
  });
});

describe('publishStoryPhotoDocument', () => {
  beforeEach(() => {
    createItem.mockReset();
    uploadImage.mockReset();
    drawScene.mockReset();
    ensureDocumentMediaDimensions.mockReset();

    ensureDocumentMediaDimensions.mockImplementation(async (d: StoryDocument) => d);
    drawScene.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
    uploadImage.mockResolvedValue(uploadedImage());
    createItem.mockResolvedValue({
      key: 'USER_STORY_ITEM:item-1',
      viewed: false,
      createdAt: new Date().toISOString(),
      sourceType: 'USER_STORY_ITEM',
      media: { url: 'x', thumbnailUrl: 'y', type: 'IMAGE' },
    });
  });

  it('uses drawScene and createItem has no overlayStyle', async () => {
    await publishStoryPhotoDocument(makeDocument(), { caption: 'hi' });

    expect(drawScene).toHaveBeenCalledOnce();
    expect(uploadImage).toHaveBeenCalledOnce();
    const file = uploadImage.mock.calls[0]![0] as File;
    expect(file.type).toBe('image/jpeg');

    expect(createItem).toHaveBeenCalledOnce();
    const payload = createItem.mock.calls[0]![0] as CreateStoryItemPayload;
    expect(payload.messageType).toBe('IMAGE');
    expect(payload.caption).toBe('hi');
    expect(payload).not.toHaveProperty('overlayStyle');
    expect('overlayStyle' in payload).toBe(false);
  });
});
