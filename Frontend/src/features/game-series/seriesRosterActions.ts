import type { Game } from '@/types';
import type { SeriesRegular, SeriesRegularUser } from '@/api/series';

/**
 * PRD 345 — what control, if any, a regular's row carries.
 *
 * User story 18: *"As a regular, I want to leave the regular roster without
 * leaving the current game, so that 'not next week' and 'not tonight' are
 * separate choices."* The backend has always allowed it
 * (`gameSeriesAccess.ts` `canRemoveSeriesRegular` lets `actor === target`
 * through), but the page gated the only control on `series.isOwner`, so a
 * regular could never reach it.
 *
 * `'leave'` and `'remove'` are deliberately different actions with different
 * copy: one is "I am stopping", the other is "you are off my list".
 */
export type SeriesRegularAction = 'none' | 'remove' | 'leave';

export type SeriesRegularActionInput = {
  /** `SeriesDetail.series.isOwner`. */
  isOwner: boolean;
  /** An ended series is a read-only archive. */
  isEnded: boolean;
  viewerUserId: string | null | undefined;
  regularUserId: string | null | undefined;
};

export function seriesRegularAction({
  isOwner,
  isEnded,
  viewerUserId,
  regularUserId,
}: SeriesRegularActionInput): SeriesRegularAction {
  if (isEnded) return 'none';
  if (!regularUserId) return 'none';
  // Own row first: an organizer who is also on their own roster is leaving,
  // not administering.
  if (viewerUserId && viewerUserId === regularUserId) return 'leave';
  if (isOwner) return 'remove';
  return 'none';
}

/**
 * Candidates for the organizer's "add a regular" control.
 *
 * `POST /series/:id/regulars` is owner-only by design (being a regular unlocks
 * the carry-over seat and the private series chat), and there is no people
 * search on this surface — so the offer is built from the series' own
 * occurrences: anybody who has held a seat in one and is not already on the
 * roster. Deduped by user id, ordered by first appearance so the most recent
 * games do not reshuffle the list on every refetch.
 */
export function seriesRegularCandidates(
  occurrences: readonly Game[],
  regulars: readonly SeriesRegular[],
): SeriesRegularUser[] {
  const taken = new Set(
    regulars.map((regular) => regular.user?.id).filter((id): id is string => Boolean(id)),
  );
  const out: SeriesRegularUser[] = [];
  const seen = new Set<string>();

  for (const game of occurrences) {
    for (const participant of game.participants ?? []) {
      if (participant.status !== 'PLAYING') continue;
      const user = participant.user;
      if (!user?.id) continue;
      if (taken.has(user.id) || seen.has(user.id)) continue;
      seen.add(user.id);
      out.push({
        id: user.id,
        firstName: user.firstName ?? null,
        lastName: user.lastName ?? null,
        avatar: user.avatar ?? null,
        isPremium: user.isPremium,
      });
    }
  }

  return out;
}

/** Display name for a regular / candidate row, never an empty string. */
export function seriesRegularName(
  user: Pick<SeriesRegularUser, 'firstName' | 'lastName'> | null | undefined,
  fallback: string,
): string {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  return name.length > 0 ? name : fallback;
}
