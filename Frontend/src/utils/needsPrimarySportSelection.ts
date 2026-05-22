import type { User } from '@/types';

/**
 * Onboarding sport modal — only for new signups who have not confirmed sports yet.
 * Legacy users are backfilled with `primarySportIsSet: true` (see migration
 * `20260520140000_user_primary_sport_is_set`). Clearing all sports in Profile does
 * not reset this flag, so existing users are not prompted again.
 */
export function needsPrimarySportSelection(user: User | null | undefined): boolean {
  if (user == null || user.nameIsSet !== true) return false;
  return user.primarySportIsSet !== true;
}
