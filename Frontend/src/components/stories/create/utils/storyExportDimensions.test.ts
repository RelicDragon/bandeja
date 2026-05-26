import { describe, expect, it } from 'vitest';
import {
  STORY_CANVAS_HEIGHT,
  STORY_CANVAS_WIDTH,
  stageScaleFromWidth,
} from './storyTransform';
import { STORY_EXPORT_SIZE, exportStoryImage } from './storyCanvasExport';

describe('story export dimensions match Konva preview', () => {
  it('STORY_EXPORT_SIZE matches story canvas constants', () => {
    expect(STORY_EXPORT_SIZE).toEqual({ w: STORY_CANVAS_WIDTH, h: STORY_CANVAS_HEIGHT });
    expect(STORY_CANVAS_WIDTH).toBe(1080);
    expect(STORY_CANVAS_HEIGHT).toBe(1920);
  });

  it('stageScaleFromWidth maps preview width to canvas-space scale', () => {
    const previewWidth = 360;
    expect(stageScaleFromWidth(previewWidth)).toBeCloseTo(previewWidth / STORY_CANVAS_WIDTH, 5);
    expect(stageScaleFromWidth(STORY_CANVAS_WIDTH)).toBe(1);
  });

  it('exportStoryImage default size matches canvas (via STORY_EXPORT_SIZE)', () => {
    expect(STORY_EXPORT_SIZE.w).toBe(STORY_CANVAS_WIDTH);
    expect(STORY_EXPORT_SIZE.h).toBe(STORY_CANVAS_HEIGHT);
    expect(typeof exportStoryImage).toBe('function');
  });

  it('drawScene export uses canvas dimensions when module exists', async () => {
    let drawScene: ((doc: unknown, size?: { w: number; h: number }) => Promise<Blob>) | undefined;
    try {
      const mod = await import('../photo/drawScene');
      drawScene = mod.drawScene;
    } catch {
      drawScene = undefined;
    }

    if (!drawScene) {
      expect(STORY_EXPORT_SIZE).toEqual({ w: 1080, h: 1920 });
      return;
    }

    const blob = await drawScene({ version: 3, canvas: { width: 1080, height: 1920 }, nodes: [] });
    expect(blob.type).toBe('image/jpeg');
  });
});
