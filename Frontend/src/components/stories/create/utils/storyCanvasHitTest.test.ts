import { describe, expect, it } from 'vitest';
import type { StickerStoryLayer, TextStoryLayer } from '../types/storyEditor.types';
import {
  hitTestLayerAtPoint,
  hitTestStickerLayer,
  hitTestTextLayer,
} from './storyCanvasHitTest';

describe('storyCanvasHitTest', () => {
  const ctx = {
    measureText: (text: string) => ({ width: text.length * 12 }),
    font: '',
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D;

  it('hits text layer at center', () => {
    const layer: TextStoryLayer = {
      id: 't1',
      type: 'text',
      text: 'Hello',
      transform: { x: 540, y: 960, scale: 1, rotation: 0 },
      style: { id: 'classic', align: 'center' },
    };
    expect(hitTestTextLayer(ctx, layer, 540, 960)).toBe(true);
    expect(hitTestTextLayer(ctx, layer, 100, 100)).toBe(false);
  });

  it('hits sticker layer within radius', () => {
    const layer: StickerStoryLayer = {
      id: 's1',
      type: 'sticker',
      emoji: '🎾',
      transform: { x: 200, y: 400, scale: 1, rotation: 0 },
    };
    expect(hitTestStickerLayer(layer, 200, 400)).toBe(true);
    expect(hitTestStickerLayer(layer, 400, 400)).toBe(false);
  });

  it('returns topmost layer', () => {
    const layers: (TextStoryLayer | StickerStoryLayer)[] = [
      {
        id: 't1',
        type: 'text',
        text: 'Back',
        transform: { x: 300, y: 300, scale: 1, rotation: 0 },
        style: { id: 'classic', align: 'center' },
      },
      {
        id: 's1',
        type: 'sticker',
        emoji: '🎾',
        transform: { x: 300, y: 300, scale: 2, rotation: 0 },
      },
    ];
    const hit = hitTestLayerAtPoint(layers, 300, 300, ctx);
    expect(hit?.id).toBe('s1');
  });
});
