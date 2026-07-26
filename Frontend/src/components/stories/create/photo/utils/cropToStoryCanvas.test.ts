import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { STORY_CANVAS_HEIGHT, STORY_CANVAS_WIDTH, defaultMediaTransform } from './transform';
import { patchDocumentMedia } from './document';
import { canvasToJpegBlob } from './cropToStoryCanvas';
import { DEFAULT_MEDIA_ADJUST, type StoryDocument } from '../types';

function doc(): StoryDocument {
  return {
    version: 3,
    canvas: { width: STORY_CANVAS_WIDTH, height: STORY_CANVAS_HEIGHT },
    backgroundId: 'm1',
    nodes: [
      {
        id: 'm1',
        type: 'media',
        mediaType: 'IMAGE',
        source: { file: new File([], 'a.jpg'), previewUrl: 'blob:old' },
        transform: { x: 10, y: 20, scale: 2, rotation: 5 },
        adjust: { ...DEFAULT_MEDIA_ADJUST, brightness: 110 },
      },
    ],
  };
}

describe('patchDocumentMedia after crop', () => {
  it('applies cover fit for known canvas-sized crop (fills 9:16, no letterbox)', () => {
    const next = patchDocumentMedia(doc(), new File([], 'crop.jpg'), 'blob:new', {
      naturalWidth: STORY_CANVAS_WIDTH,
      naturalHeight: STORY_CANVAS_HEIGHT,
    });
    const media = next.nodes[0];
    expect(media?.type).toBe('media');
    if (media?.type !== 'media') return;
    expect(media.source.naturalWidth).toBe(STORY_CANVAS_WIDTH);
    expect(media.source.naturalHeight).toBe(STORY_CANVAS_HEIGHT);
    expect(media.transform).toEqual(defaultMediaTransform(STORY_CANVAS_WIDTH, STORY_CANVAS_HEIGHT));
    expect(media.transform.scale).toBe(1);
  });

  it('sets cover scale immediately for non-canvas pixel crops too', () => {
    const next = patchDocumentMedia(doc(), new File([], 'c.jpg'), 'blob:c', {
      naturalWidth: 900,
      naturalHeight: 1600,
    });
    const media = next.nodes[0];
    if (media?.type !== 'media') return;
    expect(media.transform).toEqual(defaultMediaTransform(900, 1600));
    expect(media.transform.scale).toBeGreaterThan(1);
  });
});

describe('canvasToJpegBlob (platform fallback)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses toBlob when it returns a blob', async () => {
    const canvas = {
      toBlob: (cb: (b: Blob | null) => void) => {
        cb(new Blob(['jpeg'], { type: 'image/jpeg' }));
      },
      toDataURL: vi.fn(),
    } as unknown as HTMLCanvasElement;

    const blob = await canvasToJpegBlob(canvas, 0.9);
    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBeGreaterThan(0);
    expect(canvas.toDataURL).not.toHaveBeenCalled();
  });

  it('falls back to toDataURL when toBlob returns null (iOS WebView)', async () => {
    // minimal valid jpeg-ish data URL payload
    const jpegDataUrl =
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z';

    const canvas = {
      toBlob: (cb: (b: Blob | null) => void) => {
        cb(null);
      },
      toDataURL: () => jpegDataUrl,
    } as unknown as HTMLCanvasElement;

    const blob = await canvasToJpegBlob(canvas, 0.9);
    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe('loadImageForStoryCrop', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'Image',
      class MockImage {
        crossOrigin = '';
        naturalWidth = 100;
        naturalHeight = 200;
        width = 100;
        height = 200;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        decode = () => Promise.resolve();
        set src(_v: string) {
          queueMicrotask(() => this.onload?.());
        }
      }
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not set crossOrigin for blob URLs', async () => {
    const { loadImageForStoryCrop } = await import('./cropToStoryCanvas');
    const img = await loadImageForStoryCrop('blob:abc');
    expect(img.crossOrigin).toBe('');
  });

  it('sets crossOrigin for https URLs', async () => {
    const { loadImageForStoryCrop } = await import('./cropToStoryCanvas');
    const img = await loadImageForStoryCrop('https://cdn.example/a.jpg');
    expect(img.crossOrigin).toBe('anonymous');
  });
});
