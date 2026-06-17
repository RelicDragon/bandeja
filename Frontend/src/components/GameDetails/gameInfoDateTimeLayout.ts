const ICON_CHIP_PX = 36;
const ITEM_GAP_PX = 12;
const ROW_GAP_PX = 16;

/** Matches `pr-20` reserved for absolutely positioned action buttons in GameInfo. */
export const GAME_INFO_DATETIME_ACTION_RESERVE_PX = 80;

export function gameInfoDateTimeRowMinWidth(
  weekdayLabel: string,
  longDateText: string,
  timeText: string,
): number {
  const charPx = 7;
  const dateTextWidth = Math.max(weekdayLabel.length, longDateText.length) * charPx;
  const dateBlock = ICON_CHIP_PX + ITEM_GAP_PX + dateTextWidth;
  const timeTextWidth = timeText.length * charPx;
  const timeBlock = ICON_CHIP_PX + ITEM_GAP_PX + timeTextWidth;
  return dateBlock + ROW_GAP_PX + timeBlock;
}

export function gameInfoDateTimeNeedsWrap(
  contentWidth: number,
  weekdayLabel: string,
  longDateText: string,
  timeText: string,
): boolean {
  const available = contentWidth - GAME_INFO_DATETIME_ACTION_RESERVE_PX;
  return gameInfoDateTimeRowMinWidth(weekdayLabel, longDateText, timeText) > available;
}
