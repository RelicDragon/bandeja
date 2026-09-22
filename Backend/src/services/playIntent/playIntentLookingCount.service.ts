/**
 * PRD 363 — `GET /play-intents/count`: how many people are looking to play in
 * a city and sport right now.
 *
 * Reads intents only. No proposal, no physics, no per-viewer ranking: the whole
 * point is a query cheap enough to answer on every Find empty state. The
 * predicate is the pool's discovery predicate (`PlayIntentMatchService.
 * getPoolForViewer` in discovery mode) minus the per-viewer parts:
 *
 *   - GAME intents in `OPEN | MATCHED`, not expired, not yet consumed by a seat;
 *   - a date key inside `playIntentDiscoveryDateKeys(city.timezone)`;
 *   - whose time window has not already passed today;
 *   - whose owner is not already PLAYING in a game on those days (`inGame`).
 *
 * Blocked-user filtering is per viewer and is deliberately not applied: the
 * number is "people looking in your city", not "people you can match with".
 *
 * The user-id list is cached for 60 s per `(city, sport, window)` — in Redis
 * when configured, in process otherwise — and the viewer is subtracted after
 * the cache, so one cached list serves every viewer. `play-intent:invalidate`
 * does not bust it; a minute of staleness is fine for a hint.
 */
import { EntityType, PlayIntentStatus } from '@prisma/client';
import prisma from '../../config/database';
import { getRedisClient, isRedisConfigured } from '../redis/redisClient';
import { TtlCache } from '../../utils/ttlCache';
import {
  PLATFORM_SETTING_KEYS,
  getSetting,
  parsePlatformSettingBoolean,
} from '../platformSetting.service';
import { PUBLIC_PLATFORM_FLAG_DEFAULTS } from '../platformFlags.service';
import { playIntentDiscoveryDateKeys } from './playIntentDiscoveryWindow';
import { intentWindowIsReachable } from './playIntentFreshness';
import { PlayIntentMatchService } from './playIntentMatch.service';
import {
  LOOKING_COUNT_CACHE_TTL_SECONDS,
  countLookingExcludingViewer,
  lookingCountCacheKey,
  parseCachedLookingUserIds,
  type LookingCountResult,
} from './playIntentLookingCount';

const localCache = new TtlCache<string, string[]>(LOOKING_COUNT_CACHE_TTL_SECONDS * 1000);

async function readCachedUserIds(key: string): Promise<string[] | null> {
  const local = localCache.get(key);
  if (local) return local;
  if (!isRedisConfigured()) return null;
  const redis = await getRedisClient();
  if (!redis) return null;
  try {
    return parseCachedLookingUserIds(await redis.get(key));
  } catch {
    return null;
  }
}

async function writeCachedUserIds(key: string, userIds: string[]): Promise<void> {
  localCache.set(key, userIds);
  if (!isRedisConfigured()) return;
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(userIds), { EX: LOOKING_COUNT_CACHE_TTL_SECONDS });
  } catch (error) {
    console.error('[play-intents] looking-count cache set failed', error);
  }
}

export class PlayIntentLookingCountService {
  static async getForViewer(
    viewerUserId: string,
    cityId: string,
    sport: string,
    now: Date = new Date(),
  ): Promise<LookingCountResult> {
    const city = await prisma.city.findUnique({
      where: { id: cityId },
      select: { timezone: true },
    });
    // Same fallback the pool uses, so both agree on which day "today" is.
    const timezone = city?.timezone || 'UTC';
    const dayKeys = playIntentDiscoveryDateKeys(timezone, now);

    // On by default: no row reads as on, exactly as `resolvePublicPlatformFlags`
    // publishes it; a written row (an explicit `false`) is the kill switch.
    const raw = await getSetting(PLATFORM_SETTING_KEYS.FIND_LOOKING_COUNT_ENABLED);
    const enabled =
      raw === null
        ? PUBLIC_PLATFORM_FLAG_DEFAULTS.FIND_LOOKING_COUNT_ENABLED
        : parsePlatformSettingBoolean(raw);
    if (!enabled) return { count: null, dayKeys };

    const userIds = await this.lookingUserIds(cityId, sport, dayKeys, timezone, now);
    return { count: countLookingExcludingViewer(userIds, viewerUserId), dayKeys };
  }

  /** Distinct ids of everyone looking in the scope, viewer included. Cached. */
  static async lookingUserIds(
    cityId: string,
    sport: string,
    dayKeys: string[],
    timezone: string,
    now: Date,
  ): Promise<string[]> {
    const key = lookingCountCacheKey(cityId, sport, dayKeys);
    const cached = await readCachedUserIds(key);
    if (cached) return cached;

    const intents = await prisma.playIntent.findMany({
      where: {
        cityId,
        sport: sport as never,
        entityType: EntityType.GAME,
        status: { in: [PlayIntentStatus.OPEN, PlayIntentStatus.MATCHED] },
        expiresAt: { gt: now },
        dateKeys: { hasSome: dayKeys },
        gameParticipants: { none: {} },
      },
      select: {
        userId: true,
        dateKeys: true,
        timeOfDay: true,
        timeOfDays: true,
        startTime: true,
        endTime: true,
      },
    });

    const distinct = [
      ...new Set(
        intents
          .filter((intent) => intentWindowIsReachable(intent, timezone, now))
          .map((intent) => intent.userId),
      ),
    ];
    const busy = await PlayIntentMatchService.usersBusyPlaying(distinct, dayKeys, cityId);
    const userIds = distinct.filter((userId) => !busy.has(userId));

    await writeCachedUserIds(key, userIds);
    return userIds;
  }

  /** Test hook: drops the in-process layer (Redis keys expire on their own). */
  static clearLocalCacheForTests(): void {
    localCache.clear();
  }
}
