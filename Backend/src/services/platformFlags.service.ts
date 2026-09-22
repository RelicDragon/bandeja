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

/** Browser / CDN cache lifetime of the flags response, in seconds. */
export const PUBLIC_PLATFORM_FLAGS_MAX_AGE_SECONDS = 300;

/**
 * Pure: resolves the allow-listed keys through `read`, which is injected so the
 * unit test can drive it without a database. Any read failure for a single key
 * resolves that flag to `false` — an outage must switch optional surfaces off,
 * not take the endpoint down.
 */
export async function resolvePublicPlatformFlags(
  read: (key: string) => Promise<string | null> = getSetting
): Promise<PublicPlatformFlags> {
  const entries = await Promise.all(
    PUBLIC_PLATFORM_FLAG_KEYS.map(async (key) => {
      try {
        return [key, parsePlatformSettingBoolean(await read(key))] as const;
      } catch {
        return [key, false] as const;
      }
    })
  );
  return Object.fromEntries(entries) as PublicPlatformFlags;
}
