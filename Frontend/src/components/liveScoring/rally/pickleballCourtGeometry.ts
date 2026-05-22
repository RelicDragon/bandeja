/** Regulation half-court depth (baseline to net), feet. */
export const PICKLEBALL_HALF_COURT_FT = 22;
/** Non-volley zone depth from the net, feet. */
export const PICKLEBALL_NVZ_DEPTH_FT = 7;

export const PICKLEBALL_COURT_VIEW_BOX = '0 0 100 200';
export const PICKLEBALL_COURT_INSET = 2;
export const PICKLEBALL_NET_Y = 100;
/** Playable half-court depth in viewBox units (inset baseline to net). */
export const PICKLEBALL_HALF_COURT_UNITS =
  PICKLEBALL_NET_Y - PICKLEBALL_COURT_INSET;

/** Kitchen / NVZ boundary as distance from the net toward the baseline (viewBox units). */
export function pickleballNvzOffsetFromNet(halfCourtUnits = PICKLEBALL_HALF_COURT_UNITS): number {
  return (PICKLEBALL_NVZ_DEPTH_FT / PICKLEBALL_HALF_COURT_FT) * halfCourtUnits;
}

/** Y coordinate of the NVZ back line on the given side of the net. */
export function pickleballNvzLineY(
  side: 'top' | 'bottom',
  netY = PICKLEBALL_NET_Y,
  halfCourtUnits = PICKLEBALL_HALF_COURT_UNITS
): number {
  const offset = pickleballNvzOffsetFromNet(halfCourtUnits);
  return side === 'top' ? netY - offset : netY + offset;
}
