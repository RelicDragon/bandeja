/** PRD 358 — "Your results are in — you reached {rank}". Data: `{ noviceRank }`. */
export const NOVICE_RANK_UP_PUSH_TYPE = 'NOVICE_RANK_UP';

export function isNoviceRankUpPushType(type: string | null | undefined): boolean {
  return type === NOVICE_RANK_UP_PUSH_TYPE;
}

/**
 * Re-read novice state so `NoviceCelebrationHost` sees the new rank and plays
 * the sequence. Best-effort: the push is only a nudge — the durable signal is
 * `noviceRank > noviceMilestoneSeenRank` on the next profile refresh.
 */
export function refreshNoviceFromPush(): void {
  void import('@/hooks/useNovice')
    .then(({ refreshNoviceState }) => refreshNoviceState())
    .catch(() => {
      // Offline / signed out: the next profile refresh carries the same fields.
    });
}
