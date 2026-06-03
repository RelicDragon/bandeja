/** Zoomed enough to pan or block swipe-to-dismiss. */
export function isImageViewZoomed(
  scale: number,
  positionX: number,
  positionY: number,
): boolean {
  return scale > 1.02 || Math.hypot(positionX, positionY) > 12;
}
