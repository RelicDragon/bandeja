/** Canonical play instant for achievement crossing timelines. */
export function achievementPlayAt(game: {
  finishedDate: Date | null;
  endTime: Date | null;
  startTime: Date | null;
  createdAt: Date;
}): Date {
  return game.finishedDate ?? game.endTime ?? game.startTime ?? game.createdAt;
}

/** Sort key: playAt ascending, then id for stable ties. */
export function compareByAchievementPlayAt(
  a: { id: string; finishedDate: Date | null; endTime: Date | null; startTime: Date | null; createdAt: Date },
  b: { id: string; finishedDate: Date | null; endTime: Date | null; startTime: Date | null; createdAt: Date },
): number {
  const t = achievementPlayAt(a).getTime() - achievementPlayAt(b).getTime();
  if (t !== 0) return t;
  return a.id.localeCompare(b.id);
}
