import { STORY_CANVAS_HEIGHT, STORY_CANVAS_WIDTH, type Transform2D } from '../types';
import { viewportScaleFromFrameWidth } from '@/components/stories/create/utils/storyCompositionLayout';

export { STORY_CANVAS_WIDTH, STORY_CANVAS_HEIGHT };

export const DEFAULT_TRANSFORM: Transform2D = { x: 0, y: 0, scale: 1, rotation: 0 };

export function computeCoverScale(
  mediaWidth: number,
  mediaHeight: number,
  canvasWidth = STORY_CANVAS_WIDTH,
  canvasHeight = STORY_CANVAS_HEIGHT
): number {
  if (mediaWidth <= 0 || mediaHeight <= 0) return 1;
  return Math.max(canvasWidth / mediaWidth, canvasHeight / mediaHeight);
}

/** Scale so the full media fits inside the canvas (letterbox / pillarbox). */
export function computeContainScale(
  mediaWidth: number,
  mediaHeight: number,
  canvasWidth = STORY_CANVAS_WIDTH,
  canvasHeight = STORY_CANVAS_HEIGHT
): number {
  if (mediaWidth <= 0 || mediaHeight <= 0) return 1;
  return Math.min(canvasWidth / mediaWidth, canvasHeight / mediaHeight);
}

export function defaultMediaTransform(
  mediaWidth: number,
  mediaHeight: number,
  canvasWidth = STORY_CANVAS_WIDTH,
  canvasHeight = STORY_CANVAS_HEIGHT
): Transform2D {
  const coverScale = computeCoverScale(mediaWidth, mediaHeight, canvasWidth, canvasHeight);
  return { x: 0, y: 0, scale: coverScale, rotation: 0 };
}

export function defaultTextTransform(): Transform2D {
  return { x: STORY_CANVAS_WIDTH / 2, y: STORY_CANVAS_HEIGHT / 2, scale: 1, rotation: 0 };
}

export function defaultStickerTransform(): Transform2D {
  return { x: STORY_CANVAS_WIDTH / 2, y: STORY_CANVAS_HEIGHT / 2, scale: 1, rotation: 0 };
}

function shortestAngleDelta(a: number, b: number): number {
  return Math.abs((((a - b + 180) % 360) + 360) % 360 - 180);
}

export function snapRotation(degrees: number, threshold = 3): number {
  const snaps = [0, -90, 90, 180, -180, 270, -270];
  let bestSnap = degrees;
  let bestDelta = threshold + 1;
  for (const snap of snaps) {
    const delta = shortestAngleDelta(degrees, snap);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestSnap = snap;
    }
  }
  return bestDelta <= threshold ? bestSnap : degrees;
}

const LAYER_POSITION_PAD = 48;
const LAYER_SCALE_MIN = 0.35;
const LAYER_SCALE_MAX = 4;

export function clampLayerPosition(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(LAYER_POSITION_PAD, Math.min(STORY_CANVAS_WIDTH - LAYER_POSITION_PAD, x)),
    y: Math.max(LAYER_POSITION_PAD, Math.min(STORY_CANVAS_HEIGHT - LAYER_POSITION_PAD, y)),
  };
}

export function clampLayerTransform(transform: Transform2D): Transform2D {
  const { x, y } = clampLayerPosition(transform.x, transform.y);
  return {
    x,
    y,
    scale: Math.max(LAYER_SCALE_MIN, Math.min(LAYER_SCALE_MAX, transform.scale)),
    rotation: transform.rotation,
  };
}

/** Clamp layer drag; snap Konva target when position hits canvas padding. */
export function commitLayerDrag(
  transform: Transform2D,
  dragX: number,
  dragY: number,
  konvaTarget?: { position: (p: { x: number; y: number }) => void }
): Transform2D {
  const next = clampLayerTransform({ ...transform, x: dragX, y: dragY });
  if (konvaTarget && (next.x !== dragX || next.y !== dragY)) {
    konvaTarget.position({ x: next.x, y: next.y });
  }
  return next;
}

export type MediaPanContext = {
  mediaWidth: number;
  mediaHeight: number;
  scale: number;
  rotation?: number;
  canvasWidth?: number;
  canvasHeight?: number;
};

/** Axis-aligned pan limits from scaled media AABB vs canvas (cover + letterbox). */
export function mediaPanLimits(ctx: MediaPanContext): { maxX: number; maxY: number } {
  const canvasW = ctx.canvasWidth ?? STORY_CANVAS_WIDTH;
  const canvasH = ctx.canvasHeight ?? STORY_CANVAS_HEIGHT;
  const scaledW = Math.max(0, ctx.mediaWidth * ctx.scale);
  const scaledH = Math.max(0, ctx.mediaHeight * ctx.scale);
  const rad = ((ctx.rotation ?? 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const boundW = scaledW * c + scaledH * s;
  const boundH = scaledW * s + scaledH * c;
  return {
    maxX: Math.max(0, Math.abs(boundW - canvasW) / 2),
    maxY: Math.max(0, Math.abs(boundH - canvasH) / 2),
  };
}

export function clampMediaPan(
  x: number,
  y: number,
  ctx?: MediaPanContext
): { x: number; y: number } {
  if (!ctx || ctx.mediaWidth <= 0 || ctx.mediaHeight <= 0) {
    const fallback = 720;
    return {
      x: Math.max(-fallback, Math.min(fallback, x)),
      y: Math.max(-fallback, Math.min(fallback, y)),
    };
  }
  const { maxX, maxY } = mediaPanLimits(ctx);
  return {
    x: Math.max(-maxX, Math.min(maxX, x)),
    y: Math.max(-maxY, Math.min(maxY, y)),
  };
}

export function mediaScaleBounds(coverScale: number): { min: number; max: number } {
  // Without media aspect we approximate contain ≈ 35% of cover (typical landscape/portrait).
  // Prefer `mediaScaleBoundsForMedia` when width/height are known.
  const safeCover = Math.max(coverScale, 1e-6);
  return {
    min: Math.max(0.08, safeCover * 0.35),
    max: Math.max(safeCover * 6, 4),
  };
}

export function mediaScaleBoundsForMedia(
  mediaWidth: number,
  mediaHeight: number,
  canvasWidth = STORY_CANVAS_WIDTH,
  canvasHeight = STORY_CANVAS_HEIGHT
): { min: number; max: number; coverScale: number; containScale: number } {
  const coverScale = computeCoverScale(mediaWidth, mediaHeight, canvasWidth, canvasHeight);
  const containScale = computeContainScale(mediaWidth, mediaHeight, canvasWidth, canvasHeight);
  return {
    coverScale,
    containScale,
    // Half-contain → full photo with margin; cover×6 → deep zoom in.
    min: Math.max(0.08, containScale * 0.5),
    max: Math.max(coverScale * 6, 4),
  };
}

export function clampMediaTransform(
  transform: Transform2D,
  coverScale: number,
  options?: {
    snapRotation?: boolean;
    minScale?: number;
    maxScale?: number;
    mediaWidth?: number;
    mediaHeight?: number;
  }
): Transform2D {
  const defaults = mediaScaleBounds(coverScale);
  const min = options?.minScale ?? defaults.min;
  const max = options?.maxScale ?? defaults.max;
  const rotation =
    options?.snapRotation === false ? transform.rotation : snapRotation(transform.rotation);
  const scale = Math.max(min, Math.min(max, transform.scale));
  const panCtx =
    options?.mediaWidth != null && options?.mediaHeight != null
      ? {
          mediaWidth: options.mediaWidth,
          mediaHeight: options.mediaHeight,
          scale,
          rotation,
        }
      : undefined;
  const { x, y } = clampMediaPan(transform.x, transform.y, panCtx);
  return { x, y, scale, rotation };
}

export function stageScaleFromWidth(stageWidth: number): number {
  return viewportScaleFromFrameWidth(stageWidth);
}
