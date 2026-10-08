import sharp from 'sharp';
import { detectImageMagic } from '../services/giphyIngest/giphyValidateImage';

/** Raw upload cap (multer + validation). */
export const ANIMATED_AVATAR_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
/** Encoded animated WebP cap; avatars load in rosters and chats. */
export const ANIMATED_AVATAR_MAX_OUTPUT_BYTES = 1.5 * 1024 * 1024;
export const ANIMATED_AVATAR_SIZE = 256;
/** List rows, chat rows and tiny faces load this one. */
export const ANIMATED_AVATAR_TINY_SIZE = 96;
export const ANIMATED_AVATAR_TINY_MAX_FPS = 12;
export const ANIMATED_AVATAR_TINY_TARGET_BYTES = 150 * 1024;
const TINY_WEBP_QUALITY_STEPS = [60, 45, 35];
export const ANIMATED_AVATAR_MAX_FRAMES = 150;
export const ANIMATED_AVATAR_MAX_DURATION_MS = 60_000;
const MAX_SOURCE_SIDE = 4096;
const MAX_SOURCE_PIXELS = 100_000_000;
const MIN_CROP_SIZE = 32;
/** Browsers play sub-20ms frame delays at 100ms; bake that in so WebP matches the GIF. */
const MIN_FRAME_DELAY_MS = 20;
const DEFAULT_FRAME_DELAY_MS = 100;
const WEBP_QUALITY_STEPS = [75, 60, 45];

/** Client-extracted video frames (POST /upload/avatar/frames). */
export const AVATAR_FRAMES_MIN = 2;
export const AVATAR_FRAMES_MAX = 48;
export const AVATAR_FRAMES_FPS_MIN = 8;
export const AVATAR_FRAMES_FPS_MAX = 15;
export const AVATAR_FRAMES_MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const FRAMES_WEBP_QUALITY_STEPS = [70, 55, 45];

export class AnimatedAvatarError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'unsupported'
      | 'notAnimated'
      | 'tooLarge'
      | 'tooComplex'
      | 'tooLong'
      | 'invalidCrop'
      | 'invalidFrames'
      | 'outputTooLarge'
  ) {
    super(message);
    this.name = 'AnimatedAvatarError';
  }
}

export interface AnimatedAvatarCrop {
  x: number;
  y: number;
  size: number;
}

export interface AnimatedAvatarSourceInfo {
  kind: 'gif' | 'webp';
  width: number;
  height: number;
  frames: number;
  delays: number[];
}

export interface RenderedAnimatedAvatar {
  /** 256x256 looping animated WebP. */
  animatedWebp: Buffer;
  /** 96x96, at most 12 fps — for small faces. */
  animatedTinyWebp: Buffer;
  /** First frame, cropped (feeds the normal still avatar pipeline). */
  stillCrop: Buffer;
  /** First frame, full size (stored as originalAvatar). */
  stillOriginal: Buffer;
  frames: number;
}

function normalizeDelays(raw: number[] | undefined, frames: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < frames; i++) {
    const d = raw?.[i] ?? raw?.[raw.length - 1];
    out.push(typeof d === 'number' && d >= MIN_FRAME_DELAY_MS ? d : DEFAULT_FRAME_DELAY_MS);
  }
  return out;
}

export async function inspectAnimatedAvatarSource(buffer: Buffer): Promise<AnimatedAvatarSourceInfo> {
  if (buffer.length === 0) throw new AnimatedAvatarError('Empty file', 'unsupported');
  if (buffer.length > ANIMATED_AVATAR_MAX_UPLOAD_BYTES) {
    throw new AnimatedAvatarError('Animated avatar is too large', 'tooLarge');
  }
  const kind = detectImageMagic(buffer);
  if (kind !== 'gif' && kind !== 'webp') {
    throw new AnimatedAvatarError('Animated avatar must be a GIF or WebP', 'unsupported');
  }
  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer, { animated: true, limitInputPixels: MAX_SOURCE_PIXELS }).metadata();
  } catch {
    throw new AnimatedAvatarError('Invalid image data', 'unsupported');
  }
  const frames = meta.pages ?? 1;
  const width = meta.width ?? 0;
  const height = meta.pageHeight ?? meta.height ?? 0;
  if (frames < 2) throw new AnimatedAvatarError('Image is not animated', 'notAnimated');
  if (width < 1 || height < 1 || width > MAX_SOURCE_SIDE || height > MAX_SOURCE_SIDE) {
    throw new AnimatedAvatarError('Invalid image dimensions', 'tooComplex');
  }
  if (frames > ANIMATED_AVATAR_MAX_FRAMES || width * height * frames > MAX_SOURCE_PIXELS) {
    throw new AnimatedAvatarError('Animation is too complex', 'tooComplex');
  }
  const delays = normalizeDelays(meta.delay, frames);
  const duration = delays.reduce((a, b) => a + b, 0);
  if (duration > ANIMATED_AVATAR_MAX_DURATION_MS) {
    throw new AnimatedAvatarError('Animation is too long', 'tooLong');
  }
  return { kind, width, height, frames, delays };
}

/** Parses multipart string fields; crop is a square in source pixels. Clamps tiny float overshoot. */
export function parseAnimatedAvatarCrop(
  raw: { x?: unknown; y?: unknown; size?: unknown },
  source: { width: number; height: number }
): AnimatedAvatarCrop {
  const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN);
  let x = Math.round(num(raw.x));
  let y = Math.round(num(raw.y));
  let size = Math.round(num(raw.size));
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(size)) {
    throw new AnimatedAvatarError('Crop is required', 'invalidCrop');
  }
  const maxSide = Math.min(source.width, source.height);
  if (size < MIN_CROP_SIZE && maxSide >= MIN_CROP_SIZE) {
    throw new AnimatedAvatarError('Crop is too small', 'invalidCrop');
  }
  size = Math.min(size, maxSide);
  if (x < -2 || y < -2 || x + size > source.width + 2 || y + size > source.height + 2) {
    throw new AnimatedAvatarError('Crop is outside the image', 'invalidCrop');
  }
  x = Math.min(Math.max(0, x), source.width - size);
  y = Math.min(Math.max(0, y), source.height - size);
  return { x, y, size };
}

async function encodeAnimatedWebp(
  qualities: number[],
  build: () => sharp.Sharp,
  delay: number[]
): Promise<Buffer> {
  for (const quality of qualities) {
    const encoded = await build().webp({ quality, loop: 0, delay, effort: 4 }).toBuffer();
    if (encoded.length <= ANIMATED_AVATAR_MAX_OUTPUT_BYTES) return encoded;
  }
  throw new AnimatedAvatarError('Animated avatar is too heavy after compression', 'outputTooLarge');
}

export function parseAvatarFramesFps(raw: unknown): number {
  const fps = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
  if (!Number.isInteger(fps) || fps < AVATAR_FRAMES_FPS_MIN || fps > AVATAR_FRAMES_FPS_MAX) {
    throw new AnimatedAvatarError('Invalid frame rate', 'invalidFrames');
  }
  return fps;
}

/**
 * Join pre-cropped 256x256 JPEG/WebP frames (cut client-side from a trimmed video) into a
 * looping animated WebP. The first frame becomes the still avatar.
 */
export async function assembleAnimatedAvatarFromFrames(
  frames: Buffer[],
  fps: number
): Promise<RenderedAnimatedAvatar> {
  if (frames.length < AVATAR_FRAMES_MIN || frames.length > AVATAR_FRAMES_MAX) {
    throw new AnimatedAvatarError('Invalid frame count', 'invalidFrames');
  }
  const total = frames.reduce((n, f) => n + f.length, 0);
  if (total > AVATAR_FRAMES_MAX_TOTAL_BYTES) {
    throw new AnimatedAvatarError('Frames are too large', 'tooLarge');
  }
  for (const frame of frames) {
    const kind = detectImageMagic(frame);
    if (kind !== 'jpeg' && kind !== 'webp') {
      throw new AnimatedAvatarError('Frames must be JPEG or WebP', 'invalidFrames');
    }
    let meta: sharp.Metadata;
    try {
      meta = await sharp(frame).metadata();
    } catch {
      throw new AnimatedAvatarError('Invalid frame data', 'invalidFrames');
    }
    if (meta.width !== ANIMATED_AVATAR_SIZE || meta.height !== ANIMATED_AVATAR_SIZE || (meta.pages ?? 1) !== 1) {
      throw new AnimatedAvatarError('Frames must be 256x256 stills', 'invalidFrames');
    }
  }
  const frameMs = Math.round(1000 / fps);
  const animatedWebp = await encodeAnimatedWebp(
    FRAMES_WEBP_QUALITY_STEPS,
    () => sharp(frames, { join: { animated: true } }),
    frames.map(() => frameMs)
  );
  const animatedTinyWebp = await renderTinyAnimatedWebp(animatedWebp);
  const still = await sharp(frames[0]).png().toBuffer();
  return { animatedWebp, animatedTinyWebp, stillCrop: still, stillOriginal: still, frames: frames.length };
}

/**
 * Keep frames so no shown frame is shorter than `minFrameMs`; dropped frames' time is
 * folded into the kept frame so the loop length (real-time speed) is unchanged.
 */
export function decimateFrames(delays: number[], minFrameMs: number): { keep: number[]; delays: number[] } {
  const keep: number[] = [];
  const out: number[] = [];
  for (let i = 0; i < delays.length; i++) {
    const last = out.length - 1;
    if (last >= 0 && out[last] < minFrameMs) {
      out[last] += delays[i];
    } else {
      keep.push(i);
      out.push(delays[i]);
    }
  }
  return { keep, delays: out };
}

/** Small list variant derived from the 256px animation: 96px, ≤ 12 fps, lower quality. */
async function renderTinyAnimatedWebp(animatedWebp: Buffer): Promise<Buffer> {
  const T = ANIMATED_AVATAR_TINY_SIZE;
  // Read timing back from the encoded WebP: the encoder may merge identical frames.
  const meta = await sharp(animatedWebp, { animated: true }).metadata();
  const delays = normalizeDelays(meta.delay, meta.pages ?? 1);
  // With `animated: true` sharp resizes each page, so the raw strip is T x (T * frames).
  const { data, info } = await sharp(animatedWebp, { animated: true })
    .ensureAlpha()
    .resize(T, T, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.height !== T * delays.length) {
    throw new AnimatedAvatarError('Unexpected animation layout', 'tooComplex');
  }
  const frameBytes = T * T * info.channels;
  const picked = decimateFrames(delays, Math.round(1000 / ANIMATED_AVATAR_TINY_MAX_FPS));
  const strip = Buffer.concat(picked.keep.map((i) => data.subarray(i * frameBytes, (i + 1) * frameBytes)));
  const build = () =>
    sharp(strip, { raw: { width: T, height: T * picked.keep.length, channels: info.channels, pageHeight: T } });
  let last: Buffer | null = null;
  for (const quality of TINY_WEBP_QUALITY_STEPS) {
    last = await build().webp({ quality, loop: 0, delay: picked.delays, effort: 4 }).toBuffer();
    if (last.length <= ANIMATED_AVATAR_TINY_TARGET_BYTES) break;
  }
  return last!;
}

/**
 * Crop every frame to the same square and encode a looping animated WebP.
 * sharp (>= 0.33) applies extract/resize per page when `animated: true`.
 */
export async function renderAnimatedAvatar(
  buffer: Buffer,
  info: AnimatedAvatarSourceInfo,
  crop: AnimatedAvatarCrop
): Promise<RenderedAnimatedAvatar> {
  const region = { left: crop.x, top: crop.y, width: crop.size, height: crop.size };

  const animatedWebp = await encodeAnimatedWebp(
    WEBP_QUALITY_STEPS,
    () =>
      sharp(buffer, { animated: true, limitInputPixels: MAX_SOURCE_PIXELS })
        .extract(region)
        .resize(ANIMATED_AVATAR_SIZE, ANIMATED_AVATAR_SIZE, { fit: 'fill' }),
    info.delays
  );

  const firstFrame = sharp(buffer, { pages: 1, limitInputPixels: MAX_SOURCE_PIXELS });
  // Stills become JPEG downstream; flatten GIF transparency to white, not black.
  const stillOriginal = await firstFrame.clone().flatten({ background: '#ffffff' }).png().toBuffer();
  const stillCrop = await firstFrame
    .clone()
    .extract(region)
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer();

  const animatedTinyWebp = await renderTinyAnimatedWebp(animatedWebp);
  return { animatedWebp, animatedTinyWebp, stillCrop, stillOriginal, frames: info.frames };
}
