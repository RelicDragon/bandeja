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
  setSetting,
  listSettings,
  invalidateSettingsCache,
};
