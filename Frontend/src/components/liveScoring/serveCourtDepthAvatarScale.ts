/** Avatar scale from court depth — 1 at far end, grows with perspective half-width toward near baseline. */
export function serveCourtDepthAvatarScale(
  depthT: number,
  topHw: number,
  bottomHw: number
): number {
  const t = Math.max(0, Math.min(1, depthT));
  return (topHw + t * (bottomHw - topHw)) / topHw;
}

export function serveCourtDepthAvatarScaleFromFlatY(
  flatY: number,
  surfaceY: number,
  surfaceH: number,
  topHw: number,
  bottomHw: number
): number {
  return serveCourtDepthAvatarScale((flatY - surfaceY) / surfaceH, topHw, bottomHw);
}

export function serveCourtDepthAvatarScaleFromScreenY(
  screenY: number,
  farScreenY: number,
  nearScreenY: number,
  topHw: number,
  bottomHw: number
): number {
  const span = nearScreenY - farScreenY;
  const t = span === 0 ? 0 : (screenY - farScreenY) / span;
  return serveCourtDepthAvatarScale(t, topHw, bottomHw);
}
