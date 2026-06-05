import { describe, expect, it } from 'vitest';
import type { OverlayStyleV2 } from '../types/storyEditor.types';
import { drawComposition, drawCompositionOverlays } from './storyCompositionDraw';
import {
  STORY_CANVAS_ASPECT,
  fitStoryCanvasInStage,
  resolveStoryViewerPresentation,
} from './storyCompositionViewport';

describe('fitStoryCanvasInStage', () => {
  it('letterboxes when stage is taller than 9:16', () => {
    const v = fitStoryCanvasInStage(390, 844);
    expect(v.frameWidth).toBe(390);
    expect(v.frameHeight).toBeCloseTo(390 / STORY_CANVAS_ASPECT, 4);
    expect(v.offsetY).toBeGreaterThan(0);
    expect(v.offsetX).toBe(0);
    expect(v.frameWidth / v.frameHeight).toBeCloseTo(STORY_CANVAS_ASPECT, 5);
  });

  it('pillarboxes when stage is wider than 9:16', () => {
    const v = fitStoryCanvasInStage(844, 390);
    expect(v.frameHeight).toBe(390);
    expect(v.frameWidth).toBeCloseTo(390 * STORY_CANVAS_ASPECT, 4);
    expect(v.offsetX).toBeGreaterThan(0);
    expect(v.offsetY).toBe(0);
  });
});

describe('resolveStoryViewerPresentation', () => {
  const overlayV2: OverlayStyleV2 = {
    version: 2,
    canvas: { width: 1080, height: 1920 },
    layers: [{ id: 't1', type: 'text', text: 'Hi', transform: { x: 0, y: 0, scale: 1, rotation: 0 }, style: { id: 'classic', align: 'center' } }],
  };

  it('uses composition media for non-baked video with v2 overlay', () => {
    const p = resolveStoryViewerPresentation({
      overlayStyle: overlayV2,
      isVideo: true,
      displayWidth: 1080,
      displayHeight: 1920,
    });
    expect(p.useCompositionMedia).toBe(true);
    expect(p.showCanvasOverlay).toBe(true);
    expect(p.showDetachedOverlay).toBe(false);
  });

  it('uses composition viewport for non-baked image stories', () => {
    const p = resolveStoryViewerPresentation({
      overlayStyle: overlayV2,
      isVideo: false,
      displayWidth: 1080,
      displayHeight: 1920,
    });
    expect(p.useCompositionMedia).toBe(true);
    expect(p.showDetachedOverlay).toBe(false);
    expect(p.showCanvasOverlay).toBe(true);
  });

  it('hides live overlay when baked', () => {
    const p = resolveStoryViewerPresentation({
      overlayStyle: { ...overlayV2, baked: true },
      isVideo: false,
      displayWidth: 1080,
      displayHeight: 1920,
    });
    expect(p.showCanvasOverlay).toBe(false);
    expect(p.showDetachedOverlay).toBe(false);
  });

  it('shows legacy text only without v2 overlay', () => {
    const p = resolveStoryViewerPresentation({
      overlayStyle: undefined,
      overlayText: ' legacy ',
      isVideo: false,
      displayWidth: 1080,
      displayHeight: 1920,
    });
    expect(p.showLegacyOverlayText).toBe(true);
    expect(p.overlayV2).toBeNull();
  });
});

describe('drawCompositionOverlays', () => {
  it('matches drawComposition overlay layer calls when skipMedia', () => {
    const ctxCalls: { method: string; args: unknown[] }[] = [];
    const handler: ProxyHandler<object> = {
      get(_target, prop) {
        if (prop === 'measureText') {
          return (text: string) => ({ width: text.length * 12 });
        }
        if (typeof prop === 'string' && prop !== 'then') {
          return (...args: unknown[]) => {
            ctxCalls.push({ method: prop, args });
          };
        }
        return undefined;
      },
    };
    const ctx = new Proxy({}, handler) as CanvasRenderingContext2D;

    const overlay = {
      layers: [
        {
          id: 't1',
          type: 'text' as const,
          text: 'Match',
          transform: { x: 540, y: 400, scale: 1, rotation: 0 },
          style: { id: 'classic' as const, align: 'center' as const },
        },
      ],
    };

    drawCompositionOverlays(ctx, overlay);
    const overlayOnly = ctxCalls.filter((c) => c.method === 'fillText');

    ctxCalls.length = 0;
    drawComposition(
      ctx,
      {
        id: 'slide',
        media: {
          file: new File([], 'x'),
          type: 'IMAGE',
          previewUrl: '',
          naturalWidth: 1080,
          naturalHeight: 1920,
        },
        mediaTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
        mediaAdjust: { brightness: 100, contrast: 100, saturation: 100 },
        layers: overlay.layers,
      },
      { skipMedia: true },
      { skipMedia: true, transparentBackground: true }
    );
    const fromComposition = ctxCalls.filter((c) => c.method === 'fillText');

    expect(overlayOnly).toEqual(fromComposition);
  });
});
