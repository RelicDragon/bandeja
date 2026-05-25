import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorySlide, StickerStoryLayer, TextStoryLayer } from '../types/storyEditor.types';
import { DEFAULT_MEDIA_ADJUST, STORY_CANVAS_HEIGHT, STORY_CANVAS_WIDTH } from '../types/storyEditor.types';
import { STORY_STICKER_BASE_FONT_PX } from '../storySticker.constants';
import { mediaAdjustToCanvasFilter, mediaAdjustToCssFilter } from './storyAdjustFilters';
import {
  editorMediaCoverScale,
  exportStoryImage,
  getMediaLayerDrawParams,
  getStickerLayerDrawParams,
  getTextLayerDrawParams,
} from './storyCanvasExport';
import { STORY_TEXT_BASE_CANVAS_PX } from './storyTextStyles';
import { computeCoverScale } from './storyTransform';
import { ensureSlideNaturalDimensions } from './storySlideNaturalSize';
import { layoutCanvasText } from './layoutCanvasText';

describe('mediaAdjustToCssFilter / mediaAdjustToCanvasFilter', () => {
  it('returns none for default adjust values', () => {
    expect(mediaAdjustToCssFilter(DEFAULT_MEDIA_ADJUST)).toBe('none');
    expect(mediaAdjustToCanvasFilter(DEFAULT_MEDIA_ADJUST)).toBe('none');
  });

  it('builds brightness/contrast/saturation filters', () => {
    const adjust = { brightness: 120, contrast: 90, saturation: 110 };
    expect(mediaAdjustToCssFilter(adjust)).toBe('brightness(1.2) contrast(0.9) saturate(1.1)');
    expect(mediaAdjustToCanvasFilter(adjust)).toBe(mediaAdjustToCssFilter(adjust));
  });

  it('appends preset filter css when filterId is set', () => {
    const warm = { brightness: 100, contrast: 100, saturation: 100, filterId: 'warm' };
    expect(mediaAdjustToCssFilter(warm)).toContain('sepia(0.15)');
    expect(mediaAdjustToCanvasFilter(warm)).toBe(mediaAdjustToCssFilter(warm));
    expect(mediaAdjustToCssFilter({ ...warm, filterId: 'unknown' })).toBe('none');
  });
});

describe('layer draw params parity', () => {
  function makeSlide(overrides?: Partial<StorySlide>): StorySlide {
    return {
      id: 'slide-1',
      media: {
        file: new File(['x'], 'photo.jpg', { type: 'image/jpeg' }),
        type: 'IMAGE',
        previewUrl: 'blob:preview',
        naturalWidth: 2000,
        naturalHeight: 1500,
      },
      mediaTransform: { x: 40, y: -20, scale: 0.85, rotation: 15 },
      mediaAdjust: DEFAULT_MEDIA_ADJUST,
      layers: [],
      ...overrides,
    };
  }

  it('media layer uses canvas center + cover scale transform', () => {
    const slide = makeSlide();
    const cover = computeCoverScale(2000, 1500);
    slide.mediaTransform = { x: 0, y: 0, scale: cover, rotation: 0 };

    const params = getMediaLayerDrawParams(slide);
    expect(params.translate).toEqual([STORY_CANVAS_WIDTH / 2, STORY_CANVAS_HEIGHT / 2]);
    expect(params.scale).toEqual([cover, cover]);
    expect(params.imageRect).toEqual([-1000, -750, 2000, 1500]);
    expect(params.filter).toBe('none');
    expect(editorMediaCoverScale(slide)).toBeCloseTo(cover, 5);
  });

  it('media layer includes preset filter in export params', () => {
    const params = getMediaLayerDrawParams(
      makeSlide({ mediaAdjust: { brightness: 108, contrast: 105, saturation: 118, filterId: 'warm' } })
    );
    expect(params.filter).toContain('sepia(0.15)');
    expect(params.filter).toContain('brightness(1.08)');
  });

  it('text layer matches editor transform chain (translate → rotate → scale)', () => {
    const layer: TextStoryLayer = {
      id: 't1',
      type: 'text',
      text: 'Hello',
      transform: { x: 540, y: 960, scale: 1.5, rotation: -30 },
      style: { id: 'classic', align: 'center' },
    };
    const params = getTextLayerDrawParams(layer);
    expect(params.translate).toEqual([540, 960]);
    expect(params.rotation).toBe(-30);
    expect(params.scale).toEqual([1.5, 1.5]);
    expect(params.fontSize).toBe(STORY_TEXT_BASE_CANVAS_PX);
  });

  it('sticker layer font size scales with transform.scale', () => {
    const layer: StickerStoryLayer = {
      id: 's1',
      type: 'sticker',
      emoji: '🎾',
      transform: { x: 200, y: 400, scale: 2, rotation: 45 },
    };
    const params = getStickerLayerDrawParams(layer);
    expect(params.translate).toEqual([200, 400]);
    expect(params.rotation).toBe(45);
    expect(params.fontSize).toBe(STORY_STICKER_BASE_FONT_PX);
    expect(params.scale).toEqual([2, 2]);
  });
});

describe('exportStoryImage', () => {
  let canvasWidth = 0;
  let canvasHeight = 0;
  let ctxCalls: { method: string; args: unknown[] }[];

  beforeEach(() => {
    canvasWidth = 0;
    canvasHeight = 0;
    ctxCalls = [];

    vi.stubGlobal(
      'Image',
      class {
        crossOrigin = '';
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        naturalWidth = 2000;
        naturalHeight = 1500;
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      }
    );

    const recordCtx = () => {
      const state = { font: '', fillStyle: '' };
      const handler: ProxyHandler<object> = {
        get(_target, prop) {
          if (prop === 'measureText') {
            return (text: string) => ({ width: text.length * 12 });
          }
          if (typeof prop === 'string' && prop !== 'then') {
            return (...args: unknown[]) => {
              if (prop === 'font') state.font = String(args[0] ?? '');
              if (prop === 'fillStyle') state.fillStyle = String(args[0] ?? '');
              ctxCalls.push({ method: prop, args });
            };
          }
          return undefined;
        },
        set(_target, prop, value) {
          if (prop === 'font') state.font = String(value);
          if (prop === 'fillStyle') state.fillStyle = String(value);
          return true;
        },
      };
      return new Proxy({}, handler);
    };

    vi.stubGlobal(
      'HTMLCanvasElement',
      class {
        width = 0;
        height = 0;
        getContext() {
          return recordCtx();
        }
        toBlob(cb: (blob: Blob | null) => void) {
          cb(new Blob(['jpeg'], { type: 'image/jpeg' }));
        }
      }
    );

    vi.stubGlobal('document', {
      createElement: (tag: string) => {
        if (tag !== 'canvas') throw new Error(`unexpected tag ${tag}`);
        const el = new HTMLCanvasElement();
        Object.defineProperty(el, 'width', {
          set(v: number) {
            canvasWidth = v;
          },
          get: () => canvasWidth,
        });
        Object.defineProperty(el, 'height', {
          set(v: number) {
            canvasHeight = v;
          },
          get: () => canvasHeight,
        });
        return el;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function makeSlide(overrides?: Partial<StorySlide>): StorySlide {
    return {
      id: 'slide-1',
      media: {
        file: new File(['x'], 'photo.jpg', { type: 'image/jpeg' }),
        type: 'IMAGE',
        previewUrl: 'blob:preview',
        naturalWidth: 2000,
        naturalHeight: 1500,
      },
      mediaTransform: { x: 0, y: 0, scale: computeCoverScale(2000, 1500), rotation: 0 },
      mediaAdjust: DEFAULT_MEDIA_ADJUST,
      layers: [],
      ...overrides,
    };
  }

  it('sets canvas to export dimensions and returns jpeg blob', async () => {
    const blob = await exportStoryImage(makeSlide());
    expect(canvasWidth).toBe(STORY_CANVAS_WIDTH);
    expect(canvasHeight).toBe(STORY_CANVAS_HEIGHT);
    expect(blob.type).toBe('image/jpeg');
  });

  it('uses custom size when provided', async () => {
    await exportStoryImage(makeSlide(), { w: 540, h: 960 });
    expect(canvasWidth).toBe(540);
    expect(canvasHeight).toBe(960);
  });

  it('applies media transform steps matching getMediaLayerDrawParams', async () => {
    const slide = makeSlide({
      mediaTransform: { x: 30, y: -10, scale: 1.2, rotation: 20 },
    });
    const expected = getMediaLayerDrawParams(slide);
    await exportStoryImage(slide);

    const translateIdx = ctxCalls.findIndex((c) => c.method === 'translate');
    expect(ctxCalls[translateIdx]).toEqual({ method: 'translate', args: expected.translate });
    expect(ctxCalls[translateIdx + 1]).toEqual({ method: 'rotate', args: [(expected.rotation * Math.PI) / 180] });
    expect(ctxCalls[translateIdx + 2]).toEqual({ method: 'scale', args: expected.scale });
    expect(ctxCalls[translateIdx + 3]).toEqual({ method: 'drawImage', args: [expect.anything(), ...expected.imageRect] });
  });

  it('applies text layer scale transform on export', async () => {
    const slide = makeSlide({
      layers: [
        {
          id: 't1',
          type: 'text',
          text: 'Padel',
          transform: { x: 100, y: 200, scale: 1.8, rotation: 10 },
          style: { id: 'classic', align: 'center' },
        },
      ],
    });
    const expected = getTextLayerDrawParams(slide.layers[0] as TextStoryLayer);
    await exportStoryImage(slide);

    const textTranslate = ctxCalls.filter((c) => c.method === 'translate').at(-1);
    expect(textTranslate?.args).toEqual(expected.translate);
    const textScale = ctxCalls.filter((c) => c.method === 'scale').at(-1);
    expect(textScale?.args).toEqual(expected.scale);
  });
});

describe('layoutCanvasText integration', () => {
  it('multi-line text layout width stays within max', () => {
    const ctx = { measureText: (t: string) => ({ width: t.length * 8 }) };
    const layout = layoutCanvasText(ctx, 'Hello\nWorld line two', STORY_TEXT_BASE_CANVAS_PX);
    expect(layout.lines.length).toBe(2);
    expect(layout.height).toBeGreaterThan(STORY_TEXT_BASE_CANVAS_PX);
  });
});

describe('ensureSlideNaturalDimensions', () => {
  it('returns slide unchanged when dimensions exist', async () => {
    const slide = {
      id: 's1',
      media: {
        file: new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
        type: 'IMAGE' as const,
        previewUrl: 'blob:x',
        naturalWidth: 800,
        naturalHeight: 600,
      },
      mediaTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
      mediaAdjust: DEFAULT_MEDIA_ADJUST,
      layers: [],
    };
    const result = await ensureSlideNaturalDimensions(slide);
    expect(result.media.naturalWidth).toBe(800);
  });
});
