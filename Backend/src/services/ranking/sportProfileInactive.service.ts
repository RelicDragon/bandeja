import type { Prisma, Sport } from '@prisma/client';
import prisma from '../../config/database';
import {
  RATING_LEADERBOARD_MIN_GAMES,
  isRatingInactive,
  ratingInactiveKey,
  ratingLeaderboardActivitySince,
  recentRatedParticipantWhere,
  selectRecentRatedUserIds,
} from './ratingLeaderboardQualify';

type Db = Prisma.TransactionClient | typeof prisma;

export const INACTIVE_USER_ID_CHUNK = 400;
export const INACTIVE_UPDATE_CHUNK = 200;

export type SportProfileInactiveRow = {
  userId: string;
  sport: Sport;
  gamesPlayed: number;
  inactive: boolean;
};

export type SportProfileKey = {
  userId: string;
  sport: Sport;
};

export function chunkList<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0 || items.length === 0) return items.length === 0 ? [] : [[...items]];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export function uniqueSportProfileKeys(keys: readonly SportProfileKey[]): SportProfileKey[] {
  const seen = new Set<string>();
  const unique: SportProfileKey[] = [];
  for (const key of keys) {
    const id = ratingInactiveKey(key.userId, key.sport);
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(key);
  }
  return unique;
}

export function nextSportProfileInactiveFlags(
  profiles: readonly SportProfileInactiveRow[],
  recentRatedKeys: ReadonlySet<string>,
): Array<{ userId: string; sport: Sport; inactive: boolean }> {
  const updates: Array<{ userId: string; sport: Sport; inactive: boolean }> = [];
  for (const profile of profiles) {
    const next = isRatingInactive({
      gamesPlayed: profile.gamesPlayed,
      hasRecentRatedGame: recentRatedKeys.has(ratingInactiveKey(profile.userId, profile.sport)),
    });
    if (next !== profile.inactive) {
      updates.push({ userId: profile.userId, sport: profile.sport, inactive: next });
    }
  }
  return updates;
}

export async function loadRecentRatedKeys(
  client: Db,
  profiles: ReadonlyArray<{ userId: string; sport: Sport }>,
  since: Date,
  excludeGameId?: string,
): Promise<Set<string>> {
  const keys = new Set<string>();
  if (profiles.length === 0) return keys;

  const idsBySport = new Map<Sport, Set<string>>();
  for (const { userId, sport } of profiles) {
    const ids = idsBySport.get(sport);
    if (ids) ids.add(userId);
    else idsBySport.set(sport, new Set([userId]));
  }

  const found = await Promise.all(
    [...idsBySport.entries()].map(async ([sport, userIdSet]) => {
      const userIds = [...userIdSet];
      const recent = new Set<string>();
      for (const chunk of chunkList(userIds, INACTIVE_USER_ID_CHUNK)) {
        const rows = await client.gameParticipant.groupBy({
          by: ['userId'],
          where: recentRatedParticipantWhere(sport, since, {
            userIds: chunk,
            excludeGameId,
          }),
          _count: { userId: true },
        });
        for (const id of selectRecentRatedUserIds(chunk, rows)) recent.add(id);
      }
      return { sport, recent };
    }),
  );

  for (const { sport, recent } of found) {
    for (const userId of recent) keys.add(ratingInactiveKey(userId, sport));
  }
  return keys;
}

async function writeInactiveFlags(
  client: Db,
  updates: Array<{ userId: string; sport: Sport; inactive: boolean }>,
): Promise<number> {
  if (updates.length === 0) return 0;
  const byFlag = new Map<boolean, SportProfileKey[]>();
  byFlag.set(true, []);
  byFlag.set(false, []);
  for (const row of updates) {
    byFlag.get(row.inactive)!.push({ userId: row.userId, sport: row.sport });
  }
  for (const [inactive, rows] of byFlag) {
    for (const chunk of chunkList(rows, INACTIVE_UPDATE_CHUNK)) {
      if (chunk.length === 0) continue;
      await client.userSportProfile.updateMany({
        where: { OR: chunk },
        data: { inactive },
      });
    }
  }
  return updates.length;
}

export async function refreshSportProfilesInactive(
  keys: Array<SportProfileKey>,
  opts?: { excludeGameId?: string; client?: Db },
): Promise<number> {
  const unique = uniqueSportProfileKeys(keys);
  if (unique.length === 0) return 0;
  const client = opts?.client ?? prisma;
  const profiles: SportProfileInactiveRow[] = [];
  for (const chunk of chunkList(unique, INACTIVE_UPDATE_CHUNK)) {
    const rows = await client.userSportProfile.findMany({
      where: { OR: chunk.map((key) => ({ userId: key.userId, sport: key.sport })) },
      select: { userId: true, sport: true, gamesPlayed: true, inactive: true },
    });
    profiles.push(...rows);
  }
  const belowMin = profiles.filter((profile) => profile.gamesPlayed < RATING_LEADERBOARD_MIN_GAMES);
  const candidates = profiles.filter((profile) => profile.gamesPlayed >= RATING_LEADERBOARD_MIN_GAMES);
  const recentRatedKeys = await loadRecentRatedKeys(
    client,
    candidates,
    ratingLeaderboardActivitySince(),
    opts?.excludeGameId,
  );
  return writeInactiveFlags(
    client,
    nextSportProfileInactiveFlags([...belowMin, ...candidates], recentRatedKeys),
  );
}

export async function refreshAgedSportProfileInactive(): Promise<number> {
  const underMin = await prisma.userSportProfile.updateMany({
    where: { inactive: false, gamesPlayed: { lt: RATING_LEADERBOARD_MIN_GAMES } },
    data: { inactive: true },
  });
  const profiles = await prisma.userSportProfile.findMany({
    where: { inactive: false, gamesPlayed: { gte: RATING_LEADERBOARD_MIN_GAMES } },
    select: { userId: true, sport: true, gamesPlayed: true, inactive: true },
  });
  const recentRatedKeys = await loadRecentRatedKeys(
    prisma,
    profiles,
    ratingLeaderboardActivitySince(),
  );
  const aged = await writeInactiveFlags(
    prisma,
    nextSportProfileInactiveFlags(profiles, recentRatedKeys),
  );
  return underMin.count + aged;
}
