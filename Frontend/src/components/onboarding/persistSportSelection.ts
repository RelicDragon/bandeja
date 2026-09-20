import type { Sport } from '@shared/sport';
import type { User } from '@/types';
import { usersApi } from '@/api';
import { listEnabledSports, resolveActivePrimarySport } from '@/utils/profileSports';

/**
 * PRD 350 — write the sport step's selection back to the profile.
 *
 * `POST /users/primary-sport/confirm` is the one-shot path and the only one
 * that sets `primarySportIsSet`, but the backend rejects it once that flag is
 * on. A user who reaches this step through the "completed onboarding but no
 * enabled sport" gate has already confirmed at some point, so they need the
 * incremental add/remove path instead.
 */
export async function persistSportSelection(
  user: User | null,
  selected: readonly Sport[],
  primary: Sport,
): Promise<User> {
  if (selected.length === 0) {
    throw new Error('persistSportSelection requires at least one sport');
  }

  if (!user?.primarySportIsSet) {
    const response = await usersApi.confirmPrimarySport([...selected], primary);
    return response.data;
  }

  const before = listEnabledSports(user);
  let latest = user;

  for (const sport of selected) {
    if (before.includes(sport)) continue;
    const added = await usersApi.addSport(sport);
    latest = added.data;
  }

  for (const sport of before) {
    if (selected.includes(sport)) continue;
    const removed = await usersApi.removeSport(sport);
    latest = removed.data;
  }

  if (resolveActivePrimarySport(latest) !== primary) {
    const updated = await usersApi.setPrimarySport(primary);
    latest = updated.data;
  }

  return latest;
}
