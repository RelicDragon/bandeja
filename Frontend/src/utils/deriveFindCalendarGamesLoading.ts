/**
 * Find calendar list loading.
 * When day-scoped, list authority is ready iff `dayListReady` (selectedDayGames != null).
 * Month indexOnly loading must not keep the day list on a skeleton.
 */
export function deriveFindCalendarGamesLoading(input: {
  dayScopedEnabled: boolean;
  loadingCalendar: boolean;
  /** False while FindTab passes `selectedDayGames == null` (day not ready). */
  dayListReady: boolean;
}): boolean {
  if (input.dayScopedEnabled) {
    return !input.dayListReady;
  }
  return input.loadingCalendar;
}
