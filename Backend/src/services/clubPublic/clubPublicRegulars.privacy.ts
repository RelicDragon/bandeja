/**
 * PRD 354 — the pure half of the "Regulars" privacy rule.
 *
 * Kept free of `config/database` so the rule is unit-testable without a
 * connection string. `clubPublicRegulars.service.ts` owns the queries.
 */
import type { Sport } from '@prisma/client';

export type ClubRegular = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  isPremium: boolean;
  showPremiumStatus: boolean;
  isTrainer: boolean;
  primarySport: Sport;
};

export const CLUB_REGULARS_LIMIT = 8;
export const CLUB_REGULARS_WINDOW_DAYS = 90;

export function clubRegularsWindowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - CLUB_REGULARS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Drop everybody on either side of a block edge, then cap the row.
 *
 * The caller over-fetches candidates so a viewer with blocks still gets a full
 * row; this function is what guarantees a blocked player never appears, in
 * either direction.
 */
export function applyRegularsBlockFilter(
  candidates: ClubRegular[],
  blockedIds: ReadonlySet<string>,
  limit: number = CLUB_REGULARS_LIMIT,
): ClubRegular[] {
  return candidates.filter((c) => !blockedIds.has(c.id)).slice(0, limit);
}
