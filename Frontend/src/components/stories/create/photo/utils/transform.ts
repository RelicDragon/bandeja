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
const MEDIA_PAN_LIMIT = 720;

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

export function clampMediaPan(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(-MEDIA_PAN_LIMIT, Math.min(MEDIA_PAN_LIMIT, x)),
    y: Math.max(-MEDIA_PAN_LIMIT, Math.min(MEDIA_PAN_LIMIT, y)),
  };
}

export function mediaScaleBounds(coverScale: number): { min: number; max: number } {
  return {
    min: Math.max(0.25, coverScale * 0.85),
    max: Math.max(coverScale * 1.5, coverScale * 5),
  };
}

export function clampMediaTransform(
  transform: Transform2D,
  coverScale: number,
  options?: { snapRotation?: boolean }
): Transform2D {
  const { x, y } = clampMediaPan(transform.x, transform.y);
  const { min, max } = mediaScaleBounds(coverScale);
  const rotation =
    options?.snapRotation === false ? transform.rotation : snapRotation(transform.rotation);
  return {
    x,
    y,
    scale: Math.max(min, Math.min(max, transform.scale)),
    rotation,
  };
}

export function stageScaleFromWidth(stageWidth: number): number {
  return viewportScaleFromFrameWidth(stageWidth);
}
