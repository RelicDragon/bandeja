import prisma from '../config/database';

/**
 * Generic platform key/value settings over the `PlatformSetting` table
 * (`key String @id`, `value String @db.Text`, CONTRACT §4.3).
 *
 * Reads are cached in-process for {@link PLATFORM_SETTING_CACHE_TTL_MS}. The
 * cache is per-node: a value changed through the admin API is visible on the
 * writing node immediately and on every other node within one TTL. That is
 * acceptable for the keys below — none of them gate money movement on its own.
 */
export const PLATFORM_SETTING_KEYS = {
  /**
   * Coins per one unit of a game's currency, e.g. `100` = 100 coins per €1.
   * **Deliberately unset.** While no row exists `getNumericSetting` returns
   * `null` and PRD 348 hides the "settle with coins" option entirely.
   */
  COINS_PER_CURRENCY_UNIT: 'COINS_PER_CURRENCY_UNIT',
  /** Coins granted to the referrer when a referral completes (PRD 351). */
  REFERRAL_REWARD_REFERRER: 'REFERRAL_REWARD_REFERRER',
  /** Coins granted to the referred user when a referral completes (PRD 351). */
  REFERRAL_REWARD_REFERRED: 'REFERRAL_REWARD_REFERRED',
  /**
   * PRD 364 — organizer "Next steps" block on game details. **On by default**
   * (no row = on, see `PUBLIC_PLATFORM_FLAG_DEFAULTS`); a row that is not an
   * explicit yes switches it off and restores the attendance strip and the
   * open-spot row exactly as they were. Exposed read-only through
   * `GET /public/platform-flags`.
   */
  GAME_ORGANIZER_NEXT_ACTIONS_ENABLED: 'GAME_ORGANIZER_NEXT_ACTIONS_ENABLED',
  /**
   * PRD 363 — "{n} people looking to play" count on Find. Same on/off contract
   * as above; the key is reserved here so both PRDs share one flags endpoint.
   */
  FIND_LOOKING_COUNT_ENABLED: 'FIND_LOOKING_COUNT_ENABLED',
} as const;

export type PlatformSettingKey =
  (typeof PLATFORM_SETTING_KEYS)[keyof typeof PLATFORM_SETTING_KEYS];

export const PLATFORM_SETTING_CACHE_TTL_MS = 60_000;

/** Admin-writable keys must look like a constant so a typo cannot create junk rows. */
export const PLATFORM_SETTING_KEY_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;

export const PLATFORM_SETTING_MAX_VALUE_LENGTH = 2000;

export type PlatformSettingRow = {
  key: string;
  value: string;
  updatedAt: Date;
};

type CacheEntry = {
  /** `null` is a real, cached answer: "no row for this key". */
  value: string | null;
  expiresAt: number;
};

/**
 * TTL map used by {@link PlatformSettingService}. Exported so the unit test can
 * drive expiry from a fake clock instead of sleeping for a minute.
 */
export class PlatformSettingCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    private readonly ttlMs: number = PLATFORM_SETTING_CACHE_TTL_MS,
    private readonly now: () => number = () => Date.now()
  ) {}

  /** `undefined` = miss or expired; `null` = cached "no such setting". */
  get(key: string): string | null | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: string | null): void {
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

/**
 * Parses a stored setting into a finite number.
 * Anything non-numeric (or a missing row) falls back rather than throwing — a
 * malformed row must never take down a request path.
 */
export function parsePlatformSettingNumber(
  raw: string | null,
  fallback: number | null = null
): number | null {
  if (raw === null) return fallback;
  const trimmed = raw.trim();
  if (trimmed === '') return fallback;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

/**
 * Parses a stored on/off setting. An explicit `true` / `1` / `on` / `yes`
 * (case-insensitive, trimmed) is on, an explicit `false` / `0` / `off` / `no`
 * is off, and a missing row, an empty value or anything else is `fallback`.
 * `fallback` defaults to off so a kill switch fails closed; a surface that is
 * on by default (PRD 363's count) passes `true` and is switched off only by an
 * explicit `false` row.
 */
export function parsePlatformSettingBoolean(raw: string | null, fallback = false): boolean {
  if (raw === null) return fallback;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === 'true' || trimmed === '1' || trimmed === 'on' || trimmed === 'yes') return true;
  if (trimmed === 'false' || trimmed === '0' || trimmed === 'off' || trimmed === 'no') return false;
  return fallback;
}

const cache = new PlatformSettingCache();

export async function getSetting(key: string): Promise<string | null> {
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const row = await prisma.platformSetting.findUnique({
    where: { key },
    select: { value: true },
  });
  const value = row?.value ?? null;
  cache.set(key, value);
  return value;
}

export async function getNumericSetting(
  key: string,
  fallback?: number
): Promise<number | null> {
  const raw = await getSetting(key);
  return parsePlatformSettingNumber(raw, fallback ?? null);
}

export async function getBooleanSetting(key: string, fallback = false): Promise<boolean> {
  return parsePlatformSettingBoolean(await getSetting(key), fallback);
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.platformSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
  cache.set(key, value);
}

export async function listSettings(): Promise<PlatformSettingRow[]> {
  return prisma.platformSetting.findMany({
    orderBy: { key: 'asc' },
    select: { key: true, value: true, updatedAt: true },
  });
}

export function invalidateSettingsCache(): void {
  cache.clear();
}

export const PlatformSettingService = {
  getSetting,
  getNumericSetting,
  getBooleanSetting,
  setSetting,
  listSettings,
  invalidateSettingsCache,
};
