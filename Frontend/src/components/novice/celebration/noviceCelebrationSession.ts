/**
 * Ranks this JS session already celebrated (per user). A failed ack must not
 * replay the sequence in a loop; the server still holds the old seen-rank, so
 * the next app launch retries the celebration and the ack.
 */
const celebratedThisSession = new Map<string, number>();

export function celebratedRankThisSession(userId: string): number {
  return celebratedThisSession.get(userId) ?? 0;
}

export function recordCelebratedRank(userId: string, rank: number): void {
  celebratedThisSession.set(userId, Math.max(celebratedRankThisSession(userId), rank));
}

/** Test hook: forget session-local acks. */
export function resetNoviceCelebrationSessionForTests(): void {
  celebratedThisSession.clear();
}
