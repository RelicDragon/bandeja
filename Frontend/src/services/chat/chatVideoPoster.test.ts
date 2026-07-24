// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureChatVideoPosterBlob,
  createFallbackChatVideoPosterBlob,
} from './chatVideoPoster';

type FakeVideo = {
  preload: string;
  muted: boolean;
  defaultMuted: boolean;
  playsInline: boolean;
  src: string;
  videoWidth: number;
  videoHeight: number;
  duration: number;
  currentTime: number;
  setAttribute: ReturnType<typeof vi.fn>;
  removeAttribute: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  addEventListener: (type: string, cb: EventListener, opts?: { once?: boolean }) => void;
  removeEventListener: (type: string, cb: EventListener) => void;
  _emit: (type: string) => void;
};

function createFakeVideo(init?: Partial<Pick<FakeVideo, 'videoWidth' | 'videoHeight' | 'duration'>>): FakeVideo {
  const listeners = new Map<string, Set<EventListener>>();
  const video: FakeVideo = {
    preload: '',
    muted: false,
    defaultMuted: false,
    playsInline: false,
    src: '',
    videoWidth: init?.videoWidth ?? 0,
    videoHeight: init?.videoHeight ?? 0,
    duration: init?.duration ?? Number.NaN,
    currentTime: 0,
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    load: vi.fn(),
    play: vi.fn(async () => undefined),
    pause: vi.fn(),
    addEventListener: (type, cb) => {
      const set = listeners.get(type) ?? new Set();
      set.add(cb);
      listeners.set(type, set);
    },
    removeEventListener: (type, cb) => {
      listeners.get(type)?.delete(cb);
    },
    _emit: (type) => {
      for (const cb of [...(listeners.get(type) ?? [])]) {
        cb(new Event(type));
      }
    },
  };
  return video;
}

describe('createFallbackChatVideoPosterBlob', () => {
  it('returns a jpeg blob', () => {
    const blob = createFallbackChatVideoPosterBlob();
    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe('captureChatVideoPosterBlob', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('falls back within timeout when video never loads (iOS hang seam)', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-video');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return createFakeVideo() as unknown as HTMLVideoElement;
      return realCreate(tag);
    });

    const file = new File([new Uint8Array([0, 1, 2])], 'clip.mp4', { type: 'video/mp4' });
    const pending = captureChatVideoPosterBlob(file, 1_000);
    await vi.advanceTimersByTimeAsync(1_100);
    const blob = await pending;
    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('captures a frame when loadeddata provides dimensions', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-video');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    const fakeVideo = createFakeVideo({ videoWidth: 640, videoHeight: 360, duration: 5 });
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return fakeVideo as unknown as HTMLVideoElement;
      if (tag === 'canvas') {
        const canvas = realCreate('canvas') as HTMLCanvasElement;
        canvas.getContext = () =>
          ({
            drawImage: vi.fn(),
          }) as unknown as CanvasRenderingContext2D;
        canvas.toBlob = (cb) => cb(new Blob([new Uint8Array([9, 9, 9])], { type: 'image/jpeg' }));
        return canvas;
      }
      return realCreate(tag);
    });

    const file = new File([new Uint8Array([0, 1, 2])], 'clip.mov', { type: 'video/quicktime' });
    const pending = captureChatVideoPosterBlob(file, 2_000);
    await Promise.resolve();
    fakeVideo._emit('loadeddata');
    await Promise.resolve();
    fakeVideo._emit('seeked');
    const blob = await pending;
    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBeGreaterThan(0);
  });
});
