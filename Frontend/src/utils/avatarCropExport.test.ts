import { describe, expect, it, vi, afterEach } from 'vitest';
import { canvasToBlob } from './avatarCropExport';

describe('canvasToBlob (iOS WebView fallback)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses toBlob when it returns a blob', async () => {
    const canvas = {
      toBlob: (cb: (b: Blob | null) => void) => {
        cb(new Blob(['png'], { type: 'image/png' }));
      },
      toDataURL: vi.fn(),
    } as unknown as HTMLCanvasElement;

    const blob = await canvasToBlob(canvas, 'image/png');
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
    expect(canvas.toDataURL).not.toHaveBeenCalled();
  });

  it('falls back to toDataURL when toBlob returns null', async () => {
    const pngDataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const canvas = {
      toBlob: (cb: (b: Blob | null) => void) => {
        cb(null);
      },
      toDataURL: () => pngDataUrl,
    } as unknown as HTMLCanvasElement;

    const blob = await canvasToBlob(canvas, 'image/png');
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('falls back to toDataURL when toBlob throws', async () => {
    const jpegDataUrl =
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z';
    const canvas = {
      toBlob: () => {
        throw new Error('toBlob unsupported');
      },
      toDataURL: () => jpegDataUrl,
    } as unknown as HTMLCanvasElement;

    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.9);
    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBeGreaterThan(0);
  });
});
