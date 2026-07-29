export const GAME_MATCH_NOTIFICATION_COOLDOWN_MS =
  90 * 60 * 1000;
export const GAME_MATCH_NOTIFICATION_WINDOW_MS =
  6 * 60 * 60 * 1000;
export const GAME_MATCH_NOTIFICATION_MAX_PER_WINDOW = 3;

export type RecentGameMatchNotification = {
  eventKey: string;
  createdAt: Date;
};

export function canSendGameMatchNotification(
  recentRows: RecentGameMatchNotification[],
  eventKey: string,
  now = new Date(),
): boolean {
  const byEvent = new Map<string, Date>();
  for (const row of recentRows) {
    const previous = byEvent.get(row.eventKey);
    if (!previous || row.createdAt > previous) {
      byEvent.set(row.eventKey, row.createdAt);
    }
  }
  if (byEvent.has(eventKey)) return false;
  const recentEvents = [...byEvent.values()].filter(
    (createdAt) =>
      now.getTime() - createdAt.getTime() <=
      GAME_MATCH_NOTIFICATION_WINDOW_MS,
  );
  if (
    recentEvents.length >= GAME_MATCH_NOTIFICATION_MAX_PER_WINDOW
  ) {
    return false;
  }
  const latest = recentEvents.reduce<Date | null>(
    (current, createdAt) =>
      !current || createdAt > current ? createdAt : current,
    null,
  );
  return (
    !latest ||
    now.getTime() - latest.getTime() >=
      GAME_MATCH_NOTIFICATION_COOLDOWN_MS
  );
}
