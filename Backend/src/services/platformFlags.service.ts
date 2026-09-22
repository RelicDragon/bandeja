/**
 * PRD 363 / 364 — the public, read-only projection of a few `PlatformSetting`
 * rows: `GET /public/platform-flags`.
 *
 * Only keys listed in {@link PUBLIC_PLATFORM_FLAG_KEYS} ever leave the server.
 * A platform setting is admin-writable free text, so the projection is a
 * closed allow-list of booleans, never a pass-through of the table: adding a
 * key here is a deliberate decision that the value is safe for anyone to read.
 */
import {
  PLATFORM_SETTING_KEYS,
  getSetting,
  parsePlatformSettingBoolean,
} from './platformSetting.service';

export const PUBLIC_PLATFORM_FLAG_KEYS = [
  PLATFORM_SETTING_KEYS.GAME_ORGANIZER_NEXT_ACTIONS_ENABLED,
  PLATFORM_SETTING_KEYS.FIND_LOOKING_COUNT_ENABLED,
] as const;

export type PublicPlatformFlagKey = (typeof PUBLIC_PLATFORM_FLAG_KEYS)[number];

export type PublicPlatformFlags = Record<PublicPlatformFlagKey, boolean>;

/**
 * What a flag reads while **no row exists**. A row, once written, always wins:
 * `'false'` (or anything that is not an explicit yes) switches a default-on
 * flag off — that is the rollback path. Mirrored on the client in
 * `Frontend/src/api/platformFlags.ts` so the first render already agrees.
 */
export const PUBLIC_PLATFORM_FLAG_DEFAULTS: PublicPlatformFlags = {
  /** PRD 364 — on by default; the admin row is the kill switch. */
  GAME_ORGANIZER_NEXT_ACTIONS_ENABLED: true,
  /** PRD 363 — on by default (product decision 2026-09-22); the admin row is the kill switch. */
  FIND_LOOKING_COUNT_ENABLED: true,
};

/** Browser / CDN cache lifetime of the flags response, in seconds. */
export const PUBLIC_PLATFORM_FLAGS_MAX_AGE_SECONDS = 300;

/**
 * Pure: resolves the allow-listed keys through `read`, which is injected so the
 * unit test can drive it without a database. A missing row or a failed read for
 * a single key resolves that flag to its default — an outage must never take
 * the endpoint down, and must not flip a surface away from its shipped state.
 */
export async function resolvePublicPlatformFlags(
  read: (key: string) => Promise<string | null> = getSetting
): Promise<PublicPlatformFlags> {
  const entries = await Promise.all(
    PUBLIC_PLATFORM_FLAG_KEYS.map(async (key) => {
      try {
        const raw = await read(key);
        if (raw === null) return [key, PUBLIC_PLATFORM_FLAG_DEFAULTS[key]] as const;
        return [key, parsePlatformSettingBoolean(raw)] as const;
      } catch {
        return [key, PUBLIC_PLATFORM_FLAG_DEFAULTS[key]] as const;
      }
    })
  );
  return Object.fromEntries(entries) as PublicPlatformFlags;
}
