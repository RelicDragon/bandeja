import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MEDIA_ADJUST,
  DEFAULT_TRANSFORM,
  STORY_CANVAS_HEIGHT,
  STORY_CANVAS_WIDTH,
  type StoryDocument,
} from '../types';
import { computeCoverScale, defaultMediaTransform } from './transform';

vi.mock('./ensureMediaDimensions', () => ({
  ensureDocumentMediaDimensions: async (doc: StoryDocument) => {
    const media = doc.nodes.find((n) => n.type === 'media');
    if (media?.type !== 'media' || media.source.naturalWidth != null) return doc;
    return {
      ...doc,
      nodes: doc.nodes.map((n) =>
        n.id === media.id && n.type === 'media'
          ? {
              ...n,
              source: { ...n.source, naturalWidth: 2000, naturalHeight: 1500 },
              transform: n.transform,
            }
          : n
      ),
    };
  },
}));

import { renderDocument } from './renderDocument';
import { prepareDocumentForExport } from './prepareDocumentForExport';

function recordCtxCalls() {
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
  return {
    ctxCalls,
    ctx: new Proxy({}, handler) as CanvasRenderingContext2D,
  };
}

function mediaDrawCalls(ctxCalls: { method: string; args: unknown[] }[]) {
  const translateIdx = ctxCalls.findIndex((c) => c.method === 'translate');
  const scaleCall = ctxCalls.find((c) => c.method === 'scale');
  const drawCall = ctxCalls.find((c) => c.method === 'drawImage');
  return {
    translate: ctxCalls[translateIdx]?.args,
    scale: scaleCall?.args,
    drawRect: drawCall?.args?.slice(-4),
  };
}

describe('photo media editor → export WYSIWYG', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'Image',
      class {
        crossOrigin = '';
        onload: (() => void) | null = null;
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
  });

  function freshDoc(): StoryDocument {
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
          },
          transform: { ...DEFAULT_TRANSFORM },
          adjust: DEFAULT_MEDIA_ADJUST,
        },
      ],
    };
  }

  it('prepareDocumentForExport applies cover transform (same as registerMediaDimensions)', async () => {
    const out = await prepareDocumentForExport(freshDoc());
    const media = out.nodes[0];
    if (media?.type !== 'media') throw new Error('expected media');
    const expected = defaultMediaTransform(2000, 1500);
    expect(media.transform.scale).toBeCloseTo(expected.scale, 5);
    expect(media.source.naturalWidth).toBe(2000);
  });

  it('preview and export renderDocument produce identical media draw ops after prepare', async () => {
    const prepared = await prepareDocumentForExport(freshDoc());
    const img = { naturalWidth: 2000, naturalHeight: 1500, width: 2000, height: 1500 };

    const preview = recordCtxCalls();
    renderDocument(preview.ctx, prepared, img as HTMLImageElement);

    const exported = recordCtxCalls();
    renderDocument(exported.ctx, prepared, img as HTMLImageElement);

    expect(mediaDrawCalls(preview.ctxCalls)).toEqual(mediaDrawCalls(exported.ctxCalls));
  });

  it('export uses cover scale in ctx.scale, not 1', async () => {
    const prepared = await prepareDocumentForExport(freshDoc());
    const { ctxCalls, ctx } = recordCtxCalls();
    renderDocument(ctx, prepared, {
      naturalWidth: 2000,
      naturalHeight: 1500,
      width: 2000,
      height: 1500,
    } as HTMLImageElement);
    const cover = computeCoverScale(2000, 1500);
    const scaleCall = ctxCalls.find((c) => c.method === 'scale');
    expect(scaleCall?.args[0]).toBeCloseTo(cover, 5);
    expect(scaleCall?.args[0]).not.toBe(1);
  });
});
