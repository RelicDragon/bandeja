import type { Page } from '@playwright/test';
import { e2eApi, type E2eLoginSession } from './api-client';

type ClubListItem = { id: string; name: string; courtsCount: number; city: { timezone: string } };
type ClubList = { items: ClubListItem[]; total: number };
type ClubContext = { club: { id: string; name: string; timezone: string }; role: string; today: string; capabilities: string[] };
type ScheduleSlot = { type: string; holdId?: string; note?: string | null };

export type E2eConsoleClub = { id: string; name: string; today: string; timezone: string };

/**
 * A club the e2e user can operate, with at least one court. The seeded e2e users are platform
 * admins, so every club is reachable; outside that, the user needs a `ClubAdmin` row (role ADMIN)
 * on a club that has courts. Returns null when there is none (specs skip with that reason).
 */
export async function pickConsoleClub(token: string): Promise<E2eConsoleClub | null> {
  for (const q of ['', 'padel']) {
    const res = await e2eApi<ClubList>(token, `/club-admin/clubs?limit=50${q ? `&q=${q}` : ''}`);
    const club = (res.items ?? []).find((c) => c.courtsCount > 0);
    if (!club) continue;
    const ctx = await e2eApi<ClubContext>(token, `/club-admin/clubs/${club.id}/context`);
    if (ctx.role !== 'ADMIN') continue;
    return { id: club.id, name: ctx.club.name, today: ctx.today, timezone: ctx.club.timezone };
  }
  return null;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** Remove holds whose note carries `marker` (cleanup after a failed run). */
export async function deleteHoldsWithNote(token: string, clubId: string, date: string, marker: string): Promise<void> {
  const schedule = await e2eApi<{ slots: ScheduleSlot[] }>(token, `/club-admin/clubs/${clubId}/schedule?date=${date}`);
  for (const s of schedule.slots ?? []) {
    if (s.type === 'hold' && s.holdId && (s.note ?? '').includes(marker)) {
      await e2eApi(token, `/club-admin/clubs/${clubId}/holds/${s.holdId}`, { method: 'DELETE' }).catch(() => undefined);
    }
  }
}

/**
 * Put a fresh API session into the page (same as global setup), so console specs do not depend
 * on the shared storage state still holding a live token.
 */
export async function signInPage(page: Page, session: Pick<E2eLoginSession, 'token' | 'user'>): Promise<void> {
  await page.goto('/login');
  await page.evaluate(
    ({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.removeItem('auth_explicit_logout_at');
    },
    { token: session.token, user: session.user }
  );
}
