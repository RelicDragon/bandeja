import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StorySegment } from '@/api/stories';
import {
  preloadStorySegmentMedia,
  resetStorySegmentMediaPreload,
} from '@/utils/storySegmentMediaPreload';

vi.mock('@/services/chat/chatMediaDownloadManager', () => ({
  ensureChatMediaDownloaded: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/components/audio/audioWaveformUtils', () => ({
  resolveChatMediaUrl: (url: string) => url,
}));

type FakeVideo = {
  preload: string;
  muted: boolean;
  playsInline: boolean;
  src: string;
  removeAttribute: (name: string) => void;
  load: () => void;
  getAttribute: (name: string) => string | null;
};

function videoSegment(url: string): StorySegment {
  return {
    key: `USER_STORY_ITEM:${url}`,
    viewed: false,
    createdAt: new Date().toISOString(),
    sourceType: 'USER_STORY_ITEM',
    media: {
      url,
      thumbnailUrl: `${url}.jpg`,
      type: 'VIDEO',
      durationMs: 5000,
    },
  };
}

describe('preloadStorySegmentMedia', () => {
  afterEach(() => {
    resetStorySegmentMediaPreload();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('releases prior preload video src instead of retaining every segment', () => {
    const created: FakeVideo[] = [];
    vi.stubGlobal('document', {
      createElement: (tagName: string) => {
        if (tagName !== 'video') throw new Error(`unexpected tag ${tagName}`);
        const el: FakeVideo = {
          preload: '',
          muted: false,
          playsInline: false,
          src: '',
          removeAttribute(name: string) {
            if (name === 'src') this.src = '';
          },
          load() {},
          getAttribute(name: string) {
            if (name !== 'src') return null;
            return this.src ? this.src : null;
          },
        };
        created.push(el);
        return el;
      },
    });

    preloadStorySegmentMedia(videoSegment('https://cdn.example/a.mp4'));
    preloadStorySegmentMedia(videoSegment('https://cdn.example/b.mp4'));
    preloadStorySegmentMedia(videoSegment('https://cdn.example/c.mp4'));

    expect(created).toHaveLength(3);
    expect(created[0]!.getAttribute('src')).toBeNull();
    expect(created[1]!.getAttribute('src')).toBeNull();
    expect(created[2]!.src).toContain('c.mp4');
    expect(created[2]!.preload).toBe('metadata');
    expect(created[2]!.muted).toBe(true);
  });
});
