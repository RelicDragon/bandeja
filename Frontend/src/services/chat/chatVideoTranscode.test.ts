import { describe, expect, it } from 'vitest';
import {
  MAX_VIDEO_BYTES_AFTER_ENCODE,
  MAX_VIDEO_DURATION_MS,
  MAX_VIDEO_HEIGHT,
  MAX_VIDEO_WIDTH,
} from '@/constants/chatVideo';
import { effectiveChatVideoDurationMs, resolveEncodedChatVideoDurationMs, shouldTranscodeChatVideo } from './chatVideoTranscode';

function file(type: string, size: number, name = 'clip.mp4'): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('effectiveChatVideoDurationMs', () => {
  it('clamps duration after transcode when metadata still reports full length', () => {
    expect(
      effectiveChatVideoDurationMs(MAX_VIDEO_DURATION_MS + 120_000, true)
    ).toBe(MAX_VIDEO_DURATION_MS);
  });

  it('does not clamp passthrough duration', () => {
    expect(effectiveChatVideoDurationMs(90_000, false)).toBe(90_000);
  });
});

describe('resolveEncodedChatVideoDurationMs', () => {
  it('prefers trim length when trimmed', () => {
    expect(
      resolveEncodedChatVideoDurationMs({
        sourceDurationMs: 120_000,
        wasTranscoded: true,
        wantsTrim: true,
        trimmedDurationMs: 45_000,
      })
    ).toBe(45_000);
  });

  it('clamps long source after encode without explicit trim', () => {
    expect(
      resolveEncodedChatVideoDurationMs({
        sourceDurationMs: MAX_VIDEO_DURATION_MS + 60_000,
        wasTranscoded: true,
        wantsTrim: false,
        trimmedDurationMs: 0,
      })
    ).toBe(MAX_VIDEO_DURATION_MS);
  });
});

describe('shouldTranscodeChatVideo', () => {
  it('skips transcode for small in-limit MP4', () => {
    expect(
      shouldTranscodeChatVideo(file('video/mp4', 1_000_000), {
        durationMs: 60_000,
        width: 640,
        height: 360,
      })
    ).toBe(false);
  });

  it('requires transcode for MOV', () => {
    expect(
      shouldTranscodeChatVideo(file('video/quicktime', 1_000_000, 'clip.mov'), {
        durationMs: 60_000,
        width: 640,
        height: 360,
      })
    ).toBe(true);
  });

  it('requires transcode when duration exceeds max (trim path)', () => {
    expect(
      shouldTranscodeChatVideo(file('video/mp4', 1_000_000), {
        durationMs: MAX_VIDEO_DURATION_MS + 1,
        width: 640,
        height: 360,
      })
    ).toBe(true);
  });

  it('requires transcode when dimensions exceed max', () => {
    expect(
      shouldTranscodeChatVideo(file('video/mp4', 1_000_000), {
        durationMs: 60_000,
        width: MAX_VIDEO_WIDTH + 10,
        height: 720,
      })
    ).toBe(true);
  });

  it('requires transcode when file exceeds byte cap', () => {
    expect(
      shouldTranscodeChatVideo(file('video/mp4', MAX_VIDEO_BYTES_AFTER_ENCODE + 1), {
        durationMs: 60_000,
        width: 640,
        height: 360,
      })
    ).toBe(true);
  });

  it('requires transcode when height exceeds max', () => {
    expect(
      shouldTranscodeChatVideo(file('video/mp4', 1_000_000), {
        durationMs: 60_000,
        width: 640,
        height: MAX_VIDEO_HEIGHT + 1,
      })
    ).toBe(true);
  });
});
