import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_TRANSFORM, STORY_CANVAS_HEIGHT, STORY_CANVAS_WIDTH, type StoryDocument } from '../types';
import { computeCoverScale } from './transform';

vi.mock('./ensureMediaDimensions', () => ({
  ensureDocumentMediaDimensions: async (doc: StoryDocument) => doc,
}));

import { prepareDocumentForExport } from './prepareDocumentForExport';

function docWithScale(scale: number, naturalWidth?: number): StoryDocument {
  const mediaId = 'm1';
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
          previewUrl: 'blob:test',
          naturalWidth,
          naturalHeight: naturalWidth != null ? Math.round(naturalWidth * 0.75) : undefined,
        },
        transform: { ...DEFAULT_TRANSFORM, scale },
        adjust: { brightness: 100, contrast: 100, saturation: 100 },
      },
    ],
  };
}

describe('prepareDocumentForExport', () => {
  it('applies cover scale when transform is still default', async () => {
    const doc = docWithScale(1, 2000);
    const out = await prepareDocumentForExport(doc);
    const media = out.nodes[0];
    if (media?.type !== 'media') throw new Error('expected media');
    const expected = computeCoverScale(2000, 1500);
    expect(media.transform.scale).toBeCloseTo(expected, 5);
  });

  it('preserves user transform when not default', async () => {
    const doc = docWithScale(2.5, 2000);
    const out = await prepareDocumentForExport(doc);
    const media = out.nodes[0];
    if (media?.type !== 'media') throw new Error('expected media');
    expect(media.transform.scale).toBe(2.5);
  });
});
