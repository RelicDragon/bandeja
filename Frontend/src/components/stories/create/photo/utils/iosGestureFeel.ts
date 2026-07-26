/** Soft overscroll past min/max (iOS rubber-band). */
export function rubberband(value: number, min: number, max: number, constant = 0.45): number {
  if (value < min) {
    const overflow = min - value;
    return min - overflow * constant;
  }
  if (value > max) {
    const overflow = value - max;
    return max + overflow * constant;
  }
  return value;
}

/**
 * Wheel / trackpad zoom factor.
 * ctrl/meta + wheel is usually a trackpad pinch — use a stronger curve.
 */
export function wheelZoomFactor(
  deltaY: number,
  deltaMode: number,
  opts?: { ctrlKey?: boolean; metaKey?: boolean }
): number {
  let dy = deltaY;
  if (deltaMode === 1) dy *= 16;
  if (deltaMode === 2) dy *= 64;
  const pinchLike = !!(opts?.ctrlKey || opts?.metaKey);
  const intensity = pinchLike ? 0.012 : 0.002;
  // Clamp one-tick extreme trackpad spikes
  const capped = Math.max(-120, Math.min(120, dy));
  return Math.exp(-capped * intensity);
}

/** Double-tap: zoom in ~2× under the tap, or back to cover if already zoomed. */
export function nextDoubleTapScale(currentScale: number, coverScale: number): number {
  const atCover = Math.abs(currentScale - coverScale) / Math.max(coverScale, 1e-6) < 0.08;
  if (atCover || currentScale <= coverScale * 1.05) {
    return coverScale * 2;
  }
  return coverScale;
}
