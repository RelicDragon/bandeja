import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { StorySegment } from '@/api/stories';
import { MediaStorySlide } from './MediaStorySlide';

vi.mock('@/components/stories/viewer/storyViewerEngagementPause', () => ({
  useStoryViewerEngagementPaused: () => false,
}));

vi.mock('@/services/chat/chatMediaDownloadManager', () => ({
  ensureChatMediaDownloaded: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/components/audio/audioWaveformUtils', () => ({
  resolveChatMediaUrl: (url: string) => url,
}));

type MediaSlideSegment = Extract<StorySegment, { sourceType: 'USER_STORY_ITEM' }>;

function imageSegment(overrides?: Partial<MediaSlideSegment>): MediaSlideSegment {
  return {
    key: 'USER_STORY_ITEM:1',
    viewed: false,
    createdAt: new Date().toISOString(),
    sourceType: 'USER_STORY_ITEM',
    media: {
      url: 'https://cdn.example/story.jpg',
      thumbnailUrl: 'https://cdn.example/story-thumb.jpg',
      type: 'IMAGE',
      width: 1080,
      height: 1920,
      overlayText: 'legacy text',
      overlayStyle: {
        version: 2,
        canvas: { width: 1080, height: 1920 },
        layers: [
          {
            id: 't1',
            type: 'text',
            text: 'Should not render',
            transform: { x: 540, y: 960, scale: 1, rotation: 0 },
          },
        ],
      },
    },
    ...overrides,
  } as MediaSlideSegment;
}

function videoSegment(): MediaSlideSegment {
  return {
    key: 'USER_STORY_ITEM:2',
    viewed: false,
    createdAt: new Date().toISOString(),
    sourceType: 'USER_STORY_ITEM',
    media: {
      url: 'https://cdn.example/story.mp4',
      thumbnailUrl: 'https://cdn.example/story-thumb.jpg',
      type: 'VIDEO',
      durationMs: 10_000,
      width: 1080,
      height: 1920,
      overlayStyle: {
        version: 2,
        canvas: { width: 1080, height: 1920 },
        layers: [],
      },
    },
  };
}

const noop = () => {};

describe('MediaStorySlide viewer contract', () => {
  it('renders baked IMAGE from mediaUrl without live overlay DOM', () => {
    const html = renderToStaticMarkup(
      <MediaStorySlide
        segment={imageSegment({
          media: {
            url: 'https://cdn.example/story.jpg',
            thumbnailUrl: 'https://cdn.example/story-thumb.jpg',
            type: 'IMAGE',
            width: 1080,
            height: 1920,
            overlayStyle: {
              version: 2,
              canvas: { width: 1080, height: 1920 },
              baked: true,
              layers: [
                {
                  id: 't1',
                  type: 'text',
                  text: 'Baked — no DOM overlay',
                  transform: { x: 540, y: 960, scale: 1, rotation: 0 },
                  style: { id: 'classic', align: 'center' },
                },
              ],
            },
          },
        })}
        isActive
        paused={false}
        onVideoEnded={noop}
        onVideoError={noop}
      />
    );

    expect(html).toContain('https://cdn.example/story.jpg');
    expect(html).toMatch(/<img[^>]+src="https:\/\/cdn\.example\/story\.jpg"/);
    expect(html).not.toContain('Baked — no DOM overlay');
  });

  it('renders canvas overlay frame for non-baked v2 IMAGE layers', () => {
    const html = renderToStaticMarkup(
      <MediaStorySlide
        segment={imageSegment()}
        isActive
        paused={false}
        onVideoEnded={noop}
        onVideoError={noop}
      />
    );

    expect(html).toContain('https://cdn.example/story.jpg');
    expect(html).toMatch(/<canvas/);
    expect(html).toMatch(/scale\(1\)/);
  });

  it('uses composition viewport with media transform for non-baked IMAGE v2 overlay', () => {
    const html = renderToStaticMarkup(
      <MediaStorySlide
        segment={imageSegment({
          media: {
            url: 'https://cdn.example/story.jpg',
            thumbnailUrl: 'https://cdn.example/story-thumb.jpg',
            type: 'IMAGE',
            width: 1080,
            height: 1920,
            overlayStyle: {
              version: 2,
              canvas: { width: 1080, height: 1920 },
              sourceWidth: 1920,
              sourceHeight: 1080,
              mediaTransform: { x: 12, y: -8, scale: 1.4, rotation: 5 },
              layers: [
                {
                  id: 't1',
                  type: 'text',
                  text: 'Live overlay',
                  transform: { x: 540, y: 960, scale: 1, rotation: 0 },
                  style: { id: 'classic', align: 'center' },
                },
              ],
            },
          },
        })}
        isActive
        paused={false}
        onVideoEnded={noop}
        onVideoError={noop}
      />
    );

    expect(html).toContain('https://cdn.example/story.jpg');
    expect(html).toMatch(/<canvas/);
    expect(html).toMatch(/scale\(1\.4\)/);
    expect(html).not.toContain('Live overlay');
  });

  it('uses composition viewport with media transform for non-baked VIDEO v2 overlay', () => {
    const html = renderToStaticMarkup(
      <MediaStorySlide
        segment={{
          ...videoSegment(),
          media: {
            ...videoSegment().media,
            overlayStyle: {
              version: 2,
              canvas: { width: 1080, height: 1920 },
              sourceWidth: 1920,
              sourceHeight: 1080,
              mediaTransform: { x: 12, y: -8, scale: 1.4, rotation: 5 },
              layers: [
                {
                  id: 't1',
                  type: 'text',
                  text: 'Live overlay',
                  transform: { x: 540, y: 960, scale: 1, rotation: 0 },
                  style: { id: 'classic', align: 'center' },
                },
              ],
            },
          },
        }}
        isActive
        paused={false}
        onVideoEnded={noop}
        onVideoError={noop}
      />
    );

    expect(html).toContain('https://cdn.example/story.mp4');
    expect(html).toMatch(/<canvas/);
    expect(html).toMatch(/scale\(1\.4\)/);
    expect(html).not.toContain('Live overlay');
  });

  it('renders video from mediaUrl without overlays for VIDEO stories', () => {
    const html = renderToStaticMarkup(
      <MediaStorySlide
        segment={videoSegment()}
        isActive
        paused={false}
        onVideoEnded={noop}
        onVideoError={noop}
      />
    );

    expect(html).toContain('https://cdn.example/story.mp4');
    expect(html).toMatch(/<video[^>]+src="https:\/\/cdn\.example\/story\.mp4"/);
  });
});
