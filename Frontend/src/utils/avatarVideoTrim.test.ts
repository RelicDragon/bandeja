import { describe, expect, it } from 'vitest';
import {
  AVATAR_VIDEO_MAX_FRAMES,
  dragTrimHandle,
  filmstripTimes,
  initialTrimWindow,
  moveTrimWindow,
  trimFrameTimes,
  trimPlaybackFps,
} from './avatarVideoTrim';

describe('avatar video trim window', () => {
  it('defaults to the first three seconds, or the whole short clip', () => {
    expect(initialTrimWindow(10)).toEqual({ start: 0, end: 3 });
    expect(initialTrimWindow(2.2)).toEqual({ start: 0, end: 2.2 });
    expect(initialTrimWindow(0.6)).toEqual({ start: 0, end: 0.6 });
  });

  it('moves without changing length and stays inside the clip', () => {
    expect(moveTrimWindow({ start: 0, end: 3 }, 2, 10)).toEqual({ start: 2, end: 5 });
    expect(moveTrimWindow({ start: 6, end: 9 }, 5, 10)).toEqual({ start: 7, end: 10 });
    expect(moveTrimWindow({ start: 1, end: 3 }, -4, 10)).toEqual({ start: 0, end: 2 });
  });

  it('keeps the window between one and three seconds when dragging handles', () => {
    expect(dragTrimHandle({ start: 2, end: 5 }, 'start', 3.5, 10)).toEqual({ start: 3.5, end: 5 });
    expect(dragTrimHandle({ start: 2, end: 5 }, 'start', 4.8, 10)).toEqual({ start: 4, end: 5 });
    expect(dragTrimHandle({ start: 4, end: 5 }, 'start', 0, 10)).toEqual({ start: 2, end: 5 });
    expect(dragTrimHandle({ start: 2, end: 5 }, 'end', 2.2, 10)).toEqual({ start: 2, end: 3 });
    expect(dragTrimHandle({ start: 2, end: 3 }, 'end', 9, 10)).toEqual({ start: 2, end: 5 });
    expect(dragTrimHandle({ start: 8, end: 9 }, 'end', 12, 10)).toEqual({ start: 8, end: 10 });
  });

  it('samples 12 fps across the window, capped at 36 frames', () => {
    const three = trimFrameTimes({ start: 1, end: 4 });
    expect(three).toHaveLength(AVATAR_VIDEO_MAX_FRAMES);
    expect(three[0]).toBe(1);
    expect(three[three.length - 1]).toBeLessThan(4);
    expect(trimFrameTimes({ start: 0, end: 1.5 })).toHaveLength(18);
    expect(trimFrameTimes({ start: 0, end: 0.05 })).toHaveLength(2);
  });

  it('plays frames back at real-time speed within the backend fps range', () => {
    expect(trimPlaybackFps({ start: 0, end: 3 }, 36)).toBe(12);
    expect(trimPlaybackFps({ start: 0, end: 0.1 }, 2)).toBe(15);
    expect(trimPlaybackFps({ start: 0, end: 3 }, 6)).toBe(8);
  });

  it('spreads filmstrip thumbnails across the clip', () => {
    expect(filmstripTimes(8, 4)).toEqual([1, 3, 5, 7]);
    expect(filmstripTimes(0, 4)).toEqual([]);
  });
});
