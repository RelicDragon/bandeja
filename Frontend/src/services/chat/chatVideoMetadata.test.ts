// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadChatVideoMetadata } from './chatVideoMetadata';

describe('loadChatVideoMetadata', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('times out when metadata never loads and cleans up', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const realCreate = document.createElement.bind(document);
    const load = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag !== 'video') return realCreate(tag);
      return {
        preload: '',
        muted: false,
        playsInline: false,
        src: '',
        setAttribute: vi.fn(),
        removeAttribute: vi.fn(),
        load,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as HTMLVideoElement;
    });

    const file = new File([new Uint8Array([1])], 'a.mp4', { type: 'video/mp4' });
    const pending = loadChatVideoMetadata(file, 1_000);
    const assertion = expect(pending).rejects.toThrow('video_probe_timeout');
    await vi.advanceTimersByTimeAsync(1_100);
    await assertion;
    expect(load).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalled();
  });

  it('resolves metadata on loadedmetadata', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:ok');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const realCreate = document.createElement.bind(document);

    let onloadedmetadata: ((this: HTMLVideoElement, ev: Event) => unknown) | null = null;
    const video = {
      preload: '',
      muted: false,
      playsInline: false,
      src: '',
      duration: 12.5,
      videoWidth: 1280,
      videoHeight: 720,
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      load: vi.fn(),
      set onloadedmetadata(fn: typeof onloadedmetadata) {
        onloadedmetadata = fn;
      },
      get onloadedmetadata() {
        return onloadedmetadata;
      },
      onerror: null,
    };

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag !== 'video') return realCreate(tag);
      return video as unknown as HTMLVideoElement;
    });

    const file = new File([new Uint8Array([1])], 'a.mp4', { type: 'video/mp4' });
    const pending = loadChatVideoMetadata(file, 2_000);
    await Promise.resolve();
    onloadedmetadata?.call(video as unknown as HTMLVideoElement, new Event('loadedmetadata'));
    await expect(pending).resolves.toEqual({
      durationMs: 12_500,
      width: 1280,
      height: 720,
    });
  });
});
