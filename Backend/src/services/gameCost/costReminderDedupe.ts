import { getRedisClient } from '../redis/redisClient';
import { getSetting, setSetting } from '../platformSetting.service';

/**
 * PRD 348 — "this game was already nudged" bookkeeping.
 *
 * CONTRACT §5.4 forbids the in-memory `Set` the older reminder schedulers use:
 * a restart must not resend. So a claim is stored outside the process —
 * in Redis when it is configured (the production path, also correct across
 * several backend nodes), otherwise in a single `PlatformSetting` row.
 *
 * The state is a plain `{ [claimKey]: epochMs }` map, pruned on every write, so
 * it can never grow without bound and every decision is a pure function that the
 * unit test can drive from a fake clock.
 */

/** The one `PlatformSetting` row holding the fallback state. */
export const COST_REMINDER_STATE_KEY = 'COST_REMINDER_STATE';

/** Keep the fallback row small enough to stay well under the column's limit. */
export const COST_REMINDER_STATE_MAX_ENTRIES = 200;

export type ReminderClaimState = Record<string, number>;

export function parseReminderState(raw: string | null): ReminderClaimState {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: ReminderClaimState = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** Drops expired entries, then the oldest ones until the map fits. */
export function pruneReminderState(
  state: ReminderClaimState,
  nowMs: number,
  ttlMs: number,
  maxEntries: number = COST_REMINDER_STATE_MAX_ENTRIES,
): ReminderClaimState {
  const live = Object.entries(state).filter(([, at]) => nowMs - at < ttlMs);
  live.sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(live.slice(0, maxEntries));
}

/**
 * Pure core of a claim: `null` when the key is still within its window (the
 * caller must not send), otherwise the state to persist.
 */
export function claimInState(
  state: ReminderClaimState,
  key: string,
  nowMs: number,
  ttlMs: number,
): ReminderClaimState | null {
  const previous = state[key];
  if (previous != null && nowMs - previous < ttlMs) return null;
  return pruneReminderState({ ...state, [key]: nowMs }, nowMs, ttlMs);
}

/** When the key may next be claimed, or `null` when it may be claimed now. */
export function nextClaimAt(
  state: ReminderClaimState,
  key: string,
  nowMs: number,
  ttlMs: number,
): Date | null {
  const previous = state[key];
  if (previous == null) return null;
  const available = previous + ttlMs;
  return available > nowMs ? new Date(available) : null;
}

function redisKey(key: string): string {
  return `cost-reminder:${key}`;
}

/**
 * Take the claim for `key`, or return `false` when it is still held.
 *
 * Never throws: a storage failure degrades to "allowed", because silently
 * dropping a reminder is worse than a rare duplicate.
 */
export async function claimCostReminder(key: string, ttlMs: number): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    if (redis) {
      const result = await redis.set(redisKey(key), String(Date.now()), {
        NX: true,
        PX: ttlMs,
      });
      return result === 'OK';
    }
  } catch {
    // fall through to the database-backed fallback
  }

  try {
    const state = parseReminderState(await getSetting(COST_REMINDER_STATE_KEY));
    const next = claimInState(state, key, Date.now(), ttlMs);
    if (!next) return false;
    await setSetting(COST_REMINDER_STATE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return true;
  }
}

/** Read-only: when `key` may next be claimed. Used for the cooldown caption. */
export async function getCostReminderAvailableAt(
  key: string,
  ttlMs: number,
): Promise<Date | null> {
  try {
    const redis = await getRedisClient();
    if (redis) {
      const ttl = await redis.pTTL(redisKey(key));
      return typeof ttl === 'number' && ttl > 0 ? new Date(Date.now() + ttl) : null;
    }
  } catch {
    return null;
  }

  try {
    const state = parseReminderState(await getSetting(COST_REMINDER_STATE_KEY));
    return nextClaimAt(state, key, Date.now(), ttlMs);
  } catch {
    return null;
  }
}

export function manualRemindKey(gameId: string): string {
  return `manual:${gameId}`;
}

export function autoRemindKey(gameId: string): string {
  return `auto:${gameId}`;
}
