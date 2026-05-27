import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MEDIA_ADJUST,
  STORY_CANVAS_HEIGHT,
  STORY_CANVAS_WIDTH,
  type StoryDocument,
} from '../types';
import { computeCoverScale } from './transform';

const STICKER_BITMAP = {
  image: { __tag: 'sticker-bitmap' } as HTMLCanvasElement,
  width: 92,
  height: 92,
};

vi.mock('./renderStickerBitmap', () => ({
  renderStickerBitmap: () => STICKER_BITMAP,
}));

import { renderDocument } from './renderDocument';
import { drawScene } from './drawScene';

describe('story editor → export render parity', () => {
  let ctxCalls: { method: string; args: unknown[] }[];
  let exportCanvasSizes: { w: number; h: number }[];

  beforeEach(() => {
    ctxCalls = [];
    exportCanvasSizes = [];

    const recordCtx = () => {
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
          exportCanvasSizes.push({ w: this.width, h: this.height });
          cb(new Blob(['jpeg'], { type: 'image/jpeg' }));
        }
      }
    );

    vi.stubGlobal('document', {
      createElement: (tag: string) => {
        if (tag !== 'canvas') throw new Error(`unexpected tag ${tag}`);
        return new HTMLCanvasElement();
      },
    });

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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function makeDocument(): StoryDocument {
    const mediaId = 'media-1';
    const cover = computeCoverScale(2000, 1500);
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
            naturalWidth: 2000,
            naturalHeight: 1500,
          },
          transform: { x: 12, y: -8, scale: cover, rotation: 5 },
          adjust: DEFAULT_MEDIA_ADJUST,
        },
        {
          id: 'sticker-1',
          type: 'sticker',
          emoji: '🎾',
          transform: { x: 400, y: 600, scale: 1.5, rotation: 30 },
        },
      ],
    };
  }

  it('renderDocument centers media on canvas like Konva (translate → rotate → scale → drawImage)', () => {
    const doc = makeDocument();
    const img = { naturalWidth: 2000, naturalHeight: 1500, width: 2000, height: 1500 };
    const ctx = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
    renderDocument(ctx, doc, img as HTMLImageElement);

    const media = doc.nodes[0];
    if (media?.type !== 'media') throw new Error('expected media node');
    const t = media.transform;

    const translateIdx = ctxCalls.findIndex((c) => c.method === 'translate');
    expect(ctxCalls[translateIdx]?.args).toEqual([
      STORY_CANVAS_WIDTH / 2 + t.x,
      STORY_CANVAS_HEIGHT / 2 + t.y,
    ]);

    const rotateCall = ctxCalls.find((c) => c.method === 'rotate');
    expect(rotateCall?.args[0]).toBeCloseTo((t.rotation * Math.PI) / 180, 5);

    const scaleCall = ctxCalls.find((c) => c.method === 'scale');
    expect(scaleCall?.args).toEqual([t.scale, t.scale]);

    const mediaDraw = ctxCalls.find((c) => c.method === 'drawImage');
    expect(mediaDraw?.args.slice(-4)).toEqual([-1000, -750, 2000, 1500]);
  });

  it('renderDocument draws stickers via shared bitmap (drawImage), matching Konva sticker layer', () => {
    const doc = makeDocument();
    const img = { naturalWidth: 2000, naturalHeight: 1500, width: 2000, height: 1500 };
    const ctx = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
    renderDocument(ctx, doc, img as HTMLImageElement);

    expect(ctxCalls.some((c) => c.method === 'fillText')).toBe(false);

    const stickerDraw = ctxCalls.filter((c) => c.method === 'drawImage').at(-1);
    expect(stickerDraw?.args).toEqual([
      STICKER_BITMAP.image,
      -STICKER_BITMAP.width / 2,
      -STICKER_BITMAP.height / 2,
      STICKER_BITMAP.width,
      STICKER_BITMAP.height,
    ]);
  });

  it('drawScene exports at story canvas dimensions (viewer displays this asset)', async () => {
    const blob = await drawScene(makeDocument());
    expect(exportCanvasSizes).toContainEqual({ w: STORY_CANVAS_WIDTH, h: STORY_CANVAS_HEIGHT });
    expect(blob.type).toBe('image/jpeg');
  });
});
