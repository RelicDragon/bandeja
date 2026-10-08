/** Trim window (seconds) for the premium video avatar editor. */
export type TrimWindow = { start: number; end: number };

export const TRIM_MIN_SECONDS = 1;
export const TRIM_MAX_SECONDS = 3;
export const AVATAR_VIDEO_FPS = 12;
export const AVATAR_VIDEO_MAX_FRAMES = 36;

const clamp = (min: number, v: number, max: number) => Math.min(max, Math.max(min, v));

/** Clips shorter than the minimum use the whole clip. */
function bounds(duration: number) {
  const d = Math.max(0, duration);
  return { d, min: Math.min(TRIM_MIN_SECONDS, d), max: Math.min(TRIM_MAX_SECONDS, d) };
}

export function initialTrimWindow(duration: number): TrimWindow {
  const { max } = bounds(duration);
  return { start: 0, end: max };
}

/** Keep the length, slide the window inside the clip. */
export function moveTrimWindow(win: TrimWindow, deltaSeconds: number, duration: number): TrimWindow {
  const { d } = bounds(duration);
  const len = Math.min(win.end - win.start, d);
  const start = clamp(0, win.start + deltaSeconds, d - len);
  return { start, end: start + len };
}

/** Drag one edge to `time`; the window stays between the min and max length. */
export function dragTrimHandle(
  win: TrimWindow,
  handle: 'start' | 'end',
  time: number,
  duration: number
): TrimWindow {
  const { d, min, max } = bounds(duration);
  if (handle === 'start') {
    const start = clamp(Math.max(0, win.end - max), time, win.end - min);
    return { start, end: win.end };
  }
  const end = clamp(win.start + min, time, Math.min(d, win.start + max));
  return { start: win.start, end };
}

/** Sample times for client-side frame extraction: `fps` across the window, capped. */
export function trimFrameTimes(
  win: TrimWindow,
  fps = AVATAR_VIDEO_FPS,
  maxFrames = AVATAR_VIDEO_MAX_FRAMES
): number[] {
  const len = Math.max(0, win.end - win.start);
  const count = clamp(2, Math.round(len * fps), maxFrames);
  const step = len / count;
  return Array.from({ length: count }, (_, i) => win.start + i * step);
}

/** Frame rate the backend should play the extracted frames at (keeps real-time speed). */
export function trimPlaybackFps(win: TrimWindow, frameCount: number): number {
  const len = win.end - win.start;
  if (len <= 0) return AVATAR_VIDEO_FPS;
  return clamp(8, Math.round(frameCount / len), 15);
}

/** Thumbnail sample times for the filmstrip (frame centres). */
export function filmstripTimes(duration: number, count: number): number[] {
  if (duration <= 0 || count <= 0) return [];
  return Array.from({ length: count }, (_, i) => ((i + 0.5) * duration) / count);
}
