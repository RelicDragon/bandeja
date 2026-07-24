export type ImageViewTransform = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

export const IDENTITY_IMAGE_VIEW_TRANSFORM: ImageViewTransform = Object.freeze({
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
});

export const IMAGE_VIEW_MIN_SCALE = 1;
export const IMAGE_VIEW_MAX_SCALE = 8;
export const IMAGE_VIEW_DOUBLE_TAP_SCALE = 2.5;
export const IMAGE_VIEW_DISMISS_DISTANCE_PX = 120;
export const IMAGE_VIEW_DISMISS_VELOCITY = 0.55;

const ZOOMED_SCALE_EPS = 1.02;
const ZOOMED_ROTATION_DEG = 2;
const ZOOMED_PAN_PX = 12;
const FIT_SNAP_SCALE_EPS = 0.04;
const FIT_SNAP_ROTATION_DEG = 10;
const FIT_SNAP_PAN_PX = 28;

export function copyImageViewTransform(t: ImageViewTransform): ImageViewTransform {
  return { x: t.x, y: t.y, scale: t.scale, rotation: t.rotation };
}

/** Zoomed / rotated / panned enough to block swipe-to-dismiss. */
export function isImageViewZoomed(t: ImageViewTransform): boolean {
  return (
    t.scale > ZOOMED_SCALE_EPS ||
    Math.abs(t.rotation) > ZOOMED_ROTATION_DEG ||
    Math.hypot(t.x, t.y) > ZOOMED_PAN_PX
  );
}

export function clampImageViewScale(scale: number): number {
  return Math.min(IMAGE_VIEW_MAX_SCALE, Math.max(IMAGE_VIEW_MIN_SCALE, scale));
}

export function imageViewTransformCss(t: ImageViewTransform): string {
  return `translate3d(${t.x}px, ${t.y}px, 0) scale(${t.scale}) rotate(${t.rotation}deg)`;
}

/** Zoom toward a point (coords relative to container center). */
export function zoomImageViewAtPoint(
  t: ImageViewTransform,
  nextScale: number,
  pointX: number,
  pointY: number,
): ImageViewTransform {
  const scale = clampImageViewScale(nextScale);
  if (scale === t.scale) return t;
  const ratio = scale / t.scale;
  return {
    ...t,
    scale,
    x: pointX - (pointX - t.x) * ratio,
    y: pointY - (pointY - t.y) * ratio,
  };
}

/** Keep panned content roughly on-screen. */
export function clampImageViewPan(
  t: ImageViewTransform,
  containerWidth: number,
  containerHeight: number,
): ImageViewTransform {
  if (t.scale <= 1.01 && Math.abs(t.rotation) < 1) {
    return { ...t, x: 0, y: 0 };
  }
  const maxX = Math.max(0, ((t.scale - 1) * containerWidth) / 2 + containerWidth * 0.15);
  const maxY = Math.max(0, ((t.scale - 1) * containerHeight) / 2 + containerHeight * 0.15);
  return {
    ...t,
    x: Math.min(maxX, Math.max(-maxX, t.x)),
    y: Math.min(maxY, Math.max(-maxY, t.y)),
  };
}

export function shouldSnapImageViewToFit(t: ImageViewTransform): boolean {
  return (
    t.scale < 1 + FIT_SNAP_SCALE_EPS &&
    Math.abs(t.rotation) < FIT_SNAP_ROTATION_DEG &&
    Math.hypot(t.x, t.y) < FIT_SNAP_PAN_PX
  );
}

export function shouldDismissImageView(
  deltaY: number,
  velocityY: number,
  zoomed: boolean,
): boolean {
  if (zoomed) return false;
  if (deltaY > IMAGE_VIEW_DISMISS_DISTANCE_PX) return true;
  // Fast flick down, but only if the finger actually moved down a bit.
  return deltaY > 40 && velocityY > IMAGE_VIEW_DISMISS_VELOCITY;
}
