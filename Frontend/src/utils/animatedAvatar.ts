import type { SyntheticEvent } from 'react';
import type { BasicUser } from '@/types';
import { showsPremiumStatus } from './premiumIdentity';
import { userAvatarTinyUrlFromStandard } from './userAvatarTinyUrl';
import type { PixelCrop } from './avatarCropArea';

export const ANIMATED_AVATAR_FRAME_SIZE = 256;
/** Matches the backend multer cap for /media/upload/avatar/animated. */
export const ANIMATED_AVATAR_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

type AnimatedAvatarUser = Pick<BasicUser, 'avatar' | 'avatarAnimated' | 'isPremium' | 'showPremiumStatus'>;

const ANIMATED_END_RE = /_avatar\.anim\.webp$/i;
const ANIMATED_TINY_SUFFIX = '_avatar.anim.tiny.webp';

/** 96px list variant stored beside `avatarAnimated` (mirrors the backend helper). */
export function animatedAvatarTinyUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const t = url.trim();
  const cut = [t.indexOf('?'), t.indexOf('#')].filter((i) => i >= 0);
  const end = cut.length ? Math.min(...cut) : t.length;
  const base = t.slice(0, end);
  if (!ANIMATED_END_RE.test(base)) return null;
  return base.replace(ANIMATED_END_RE, ANIMATED_TINY_SUFFIX) + t.slice(end);
}

/**
 * Animated avatar for any face size (`tiny` → the 96px variant). Others see it while the
 * member shows Premium status; `own` previews ignore that switch. Reduced motion → still.
 * Push / Telegram never use this; they keep `avatar`.
 */
export function animatedAvatarSrc(
  user: AnimatedAvatarUser | null | undefined,
  opts?: { own?: boolean; tiny?: boolean }
): string | null {
  if (!user?.avatarAnimated || !user.avatar) return null;
  const allowed = opts?.own ? user.isPremium === true : showsPremiumStatus(user);
  if (!allowed || prefersReducedMotion()) return null;
  return opts?.tiny ? animatedAvatarTinyUrl(user.avatarAnimated) ?? user.avatarAnimated : user.avatarAnimated;
}

/** Large face src: animation when allowed, else the standard still. */
export function userFaceSrc(user: AnimatedAvatarUser | null | undefined, opts?: { own?: boolean }): string | null {
  return animatedAvatarSrc(user, opts) ?? user?.avatar ?? null;
}

/** Small face preferred src (the `tinyUrl` slot): 96px animation when allowed, else the tiny still. */
export function userFaceTinySrc(user: AnimatedAvatarUser | null | undefined, opts?: { own?: boolean }): string | null {
  return animatedAvatarSrc(user, { ...opts, tiny: true }) ?? userAvatarTinyUrlFromStandard(user?.avatar);
}

/** `<img onError>`: a broken animation falls back to the still once. */
export function fallbackToStillAvatar(still: string | null | undefined) {
  return (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (still && img.dataset.animatedFallback !== '1') {
      img.dataset.animatedFallback = '1';
      img.src = still;
    }
  };
}

/** Cheap sniff: more than one GIF frame, or a WebP with the animation flag / ANIM chunk. */
export async function isAnimatedImageFile(file: Blob): Promise<boolean> {
  if (file.type !== 'image/gif' && file.type !== 'image/webp') return false;
  const head = new Uint8Array(await file.slice(0, Math.min(file.size, 2 * 1024 * 1024)).arrayBuffer());
  if (file.type === 'image/gif') {
    let frames = 0;
    for (let i = 0; i + 3 < head.length; i++) {
      // Graphic Control Extension precedes each frame: 21 F9 04.
      if (head[i] === 0x21 && head[i + 1] === 0xf9 && head[i + 2] === 0x04) {
        frames++;
        if (frames > 1) return true;
      }
    }
    return false;
  }
  const ascii = (o: number, n: number) => String.fromCharCode(...head.slice(o, o + n));
  if (head.length < 21 || ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WEBP') return false;
  if (ascii(12, 4) === 'VP8X' && (head[20] & 0x02) !== 0) return true;
  for (let i = 12; i + 4 < head.length; i++) {
    if (head[i] === 0x41 && ascii(i, 4) === 'ANIM') return true;
  }
  return false;
}

export function isVideoFile(file: Blob): boolean {
  return file.type.startsWith('video/');
}

/** Square crop in source pixels for the GIF route. */
export function squareCropFromPixels(crop: PixelCrop): { x: number; y: number; size: number } {
  const size = Math.round(Math.min(crop.width, crop.height));
  return { x: Math.round(crop.x), y: Math.round(crop.y), size };
}

function waitForSeek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('seek timeout'));
    }, 4000);
    const onSeeked = () => {
      cleanup();
      // A seek resolves before the new frame is composited on some engines.
      const rvfc = (video as HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: () => void) => number;
      }).requestVideoFrameCallback;
      if (typeof rvfc === 'function') {
        let done = false;
        const finish = () => {
          if (!done) {
            done = true;
            resolve();
          }
        };
        rvfc.call(video, finish);
        window.setTimeout(finish, 80);
      } else {
        resolve();
      }
    };
    const onError = () => {
      cleanup();
      reject(new Error('video decode failed'));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = time;
  });
}

function encodeCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  const tryType = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
  return tryType('image/webp', 0.85).then(async (webp) => {
    if (webp && webp.type === 'image/webp' && webp.size > 0) return webp;
    const jpeg = await tryType('image/jpeg', 0.85);
    if (!jpeg || jpeg.size === 0) throw new Error('frame encode failed');
    return jpeg;
  });
}

/**
 * Cut `times` out of a (paused) video into 256x256 squares. Runs on the editor's own
 * video element so iOS decodes the clip once.
 */
export async function extractVideoAvatarFrames(
  video: HTMLVideoElement,
  crop: PixelCrop,
  times: number[],
  onProgress?: (done: number, total: number) => void
): Promise<Blob[]> {
  const canvas = document.createElement('canvas');
  canvas.width = ANIMATED_AVATAR_FRAME_SIZE;
  canvas.height = ANIMATED_AVATAR_FRAME_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const side = Math.min(crop.width, crop.height);

  video.pause();
  const frames: Blob[] = [];
  for (let i = 0; i < times.length; i++) {
    await waitForSeek(video, times[i]);
    ctx.drawImage(video, crop.x, crop.y, side, side, 0, 0, ANIMATED_AVATAR_FRAME_SIZE, ANIMATED_AVATAR_FRAME_SIZE);
    frames.push(await encodeCanvas(canvas));
    onProgress?.(i + 1, times.length);
  }
  return frames;
}

/** Small filmstrip thumbnails, taken from a separate hidden video so playback keeps looping. */
export async function extractFilmstrip(src: string, times: number[], height = 56): Promise<string[]> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = src;
  try {
    await new Promise<void>((resolve, reject) => {
      if (video.readyState >= 2) return resolve();
      const t = window.setTimeout(() => reject(new Error('filmstrip load timeout')), 8000);
      video.addEventListener('loadeddata', () => { window.clearTimeout(t); resolve(); }, { once: true });
      video.addEventListener('error', () => { window.clearTimeout(t); reject(new Error('filmstrip load failed')); }, { once: true });
      video.load();
    });
    const w = Math.max(1, Math.round((video.videoWidth / Math.max(1, video.videoHeight)) * height));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    const out: string[] = [];
    for (const time of times) {
      await waitForSeek(video, time);
      ctx.drawImage(video, 0, 0, w, height);
      out.push(canvas.toDataURL('image/jpeg', 0.6));
    }
    return out;
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}
