/**
 * Activity timeline model (pure): action groups for the filter and the i18n key + values that
 * turn one `ClubActivityItem` into a sentence. `meta` values are short and render-safe
 * (`clubAdminActivity.service.ts`); anything missing falls back to a sentence without it.
 */
import type { ClubActivityAction, ClubActivityItem } from '@shared/clubAdmin/contract';

export type ActivityGroup = 'bookings' | 'courts' | 'settings' | 'billing' | 'team';

export const ACTIVITY_GROUPS: Record<ActivityGroup, readonly ClubActivityAction[]> = {
  bookings: ['HOLD_CREATED', 'HOLD_UPDATED', 'HOLD_DELETED', 'GAME_CANCELLED', 'COURT_CLEARED'],
  courts: ['COURT_CREATED', 'COURT_UPDATED', 'COURTS_REORDERED'],
  settings: ['CLUB_UPDATED', 'HOURS_UPDATED', 'PRICING_UPDATED'],
  billing: ['CHARGE_CREATED', 'CHARGE_UPDATED', 'PAYMENT_RECORDED', 'PAYMENT_VOIDED'],
  team: ['TEAM_ADDED', 'TEAM_REMOVED', 'TEAM_ROLE_CHANGED'],
};

export const ACTIVITY_GROUP_IDS = Object.keys(ACTIVITY_GROUPS) as ActivityGroup[];

export function activityGroupOf(action: ClubActivityAction): ActivityGroup {
  return ACTIVITY_GROUP_IDS.find((g) => ACTIVITY_GROUPS[g].includes(action)) ?? 'settings';
}

export interface ActivitySentence {
  /** Key under `club.activity.action` in the clubAdmin namespace. */
  key: string;
  values: Record<string, string | number>;
  /** Instants in `meta` the caller formats in the club zone (`when`). */
  startTime: string | null;
  amountCents: number | null;
  currency: string | null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Picks the sentence variant by which meta values are present, so the UI never prints
 * "undefined" or an empty court name. Variant suffixes: `_court`, `_game`, `_active`, `_inactive`,
 * `_fields`. `values.count` drives i18next plurals (holds in a series, rules, changed fields).
 */
export function activitySentence(item: ClubActivityItem): ActivitySentence {
  const m = item.meta ?? {};
  const base = `${item.action}`;
  const values: Record<string, string | number> = {};
  let variant = '';
  const court = str(m.court);
  const game = str(m.game);
  const user = str(m.user);
  const label = str(m.label);
  const role = str(m.role);
  const count = num(m.count);
  const method = str(m.method);
  const status = str(m.status);
  if (court) values.court = court;
  if (game) values.game = game;
  if (user) values.user = user;
  if (label) values.label = label;
  if (role) values.role = role;
  if (method) values.method = method;
  if (status) values.status = status;
  values.count = count ?? 1;
  switch (item.action) {
    case 'HOLD_CREATED':
    case 'HOLD_UPDATED':
    case 'HOLD_DELETED':
      variant = court ? '_court' : '';
      break;
    case 'GAME_CANCELLED':
    case 'COURT_CLEARED':
      variant = game ? '_game' : '';
      break;
    case 'COURT_UPDATED':
      variant = m.isActive === true ? '_active' : m.isActive === false ? '_inactive' : '';
      break;
    case 'CLUB_UPDATED': {
      const fields = str(m.fields);
      if (fields) values.count = fields.split(',').length;
      variant = fields ? '_fields' : '';
      break;
    }
    case 'HOURS_UPDATED':
      values.count = num(m.closures) ?? 0;
      break;
    case 'PRICING_UPDATED':
      values.count = num(m.rules) ?? 0;
      break;
    default:
      break;
  }
  return {
    key: `${base}${variant}`,
    values,
    startTime: str(m.startTime),
    amountCents: num(m.amountCents),
    currency: str(m.currency),
  };
}
