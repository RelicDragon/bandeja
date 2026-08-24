export const CITY_SELECTOR_SHEET_CLASS = 'city-selector-sheet';
export const CITY_SELECTOR_SHEET_BODY_CLASS = 'city-selector-sheet-body';

const RESTING_MAX_VH = 0.94;
const RESTING_MAX_PX = 960;
const KEYBOARD_TOP_GAP_PX = 24;

export function citySelectorSheetHeightPx(opts: {
  viewportPx: number;
  keyboardPx: number;
  safeTopPx: number;
}): number {
  const resting = Math.min(opts.viewportPx * RESTING_MAX_VH, RESTING_MAX_PX);
  if (opts.keyboardPx <= 0) return resting;
  return Math.min(
    resting,
    opts.viewportPx - opts.keyboardPx - opts.safeTopPx - KEYBOARD_TOP_GAP_PX,
  );
}
