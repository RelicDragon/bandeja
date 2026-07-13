import { Sport, Prisma, SportLevelSource } from '@prisma/client';
import prisma from '../../config/database';
import { PROFILE_SELECT_FIELDS } from '../../utils/constants';
import { ApiError } from '../../utils/ApiError';
import { getImplementedSports, getSportConfig, resolveSport } from '../../sport/sportRegistry';
import { isQuestionnaireSuggestedForProfile } from '../../sport/questionnaires/suggested';
import { clampSportProfileGameStats } from '../results/outcomeStatsSnapshot';
import { attachPlayStreaksToUser } from '../results/playStreak.service';

export const MIN_SPORT_LEVEL = 1.0;
export const MAX_SPORT_LEVEL = 7.0;
/** Minimum rated games in a sport before it appears in `sportsPlayed` (Find / disclosure). */
export const SPORTS_PLAYED_THRESHOLD = 3;
const DEFAULT_NEW_SPORT_LEVEL = MIN_SPORT_LEVEL;

export type SportsPlayedMap = Partial<Record<Sport, number>>;

export function buildSportsPlayed(
  sportProfiles: SportProfileSnapshot[] | null | undefined,
  threshold = SPORTS_PLAYED_THRESHOLD,
): SportsPlayedMap {
  const out: SportsPlayedMap = {};
  for (const p of sportProfiles ?? []) {
    if (p.gamesPlayed >= threshold) {
      out[p.sport] = p.gamesPlayed;
    }
  }
  return out;
}

export function enrichProfileUser<
  T extends { sportProfiles?: SportProfileSnapshot[]; primarySport?: Sport | string | null },
>(
  user: T,
): T & {
  sportsPlayed: SportsPlayedMap;
  level: number;
  reliability: number;
  gamesPlayed: number;
  gamesWon: number;
} {
  const sport = resolveSport(user.primarySport ?? Sport.PADEL);
  const snapshot = resolveUserSportSnapshot(user, sport);
  return {
    ...user,
    level: snapshot.level,
    reliability: snapshot.reliability,
    gamesPlayed: snapshot.gamesPlayed,
    gamesWon: snapshot.gamesWon,
    sportsPlayed: buildSportsPlayed(user.sportProfiles),
  };
}

export async function touchLastCreatedSport(userId: string, sport: Sport): Promise<void> {
  assertSportImplemented(sport);
  await prisma.user.update({
    where: { id: userId },
    data: { lastCreatedSport: sport },
  });
}

type SportProfileSnapshot = {
  sport: Sport;
  level: number;
  reliability: number;
  gamesPlayed: number;
  gamesWon: number;
};

type UserWithSportProfiles = {
  sportProfiles?: SportProfileSnapshot[];
  [key: string]: unknown;
};

export type SportProjectedUserFields = {
  level: number;
  reliability: number;
  gamesPlayed: number;
  gamesWon: number;
};

type ProjectedUser<T> = T extends null | undefined
  ? T
  : Omit<T, 'sportProfiles'> & SportProjectedUserFields;

export function assertSportImplemented(sport: Sport): void {
  const config = getSportConfig(sport);
  if (!config.implemented) {
    throw new ApiError(400, `Sport ${sport} is not available yet`);
  }
}

/** Keep `primarySport` ∈ `sportsEnabled` when at least one sport is enabled. */
export function reconcilePrimarySport(
  primarySport: Sport | null | undefined,
  sportsEnabled: Sport[],
): Sport {
  if (sportsEnabled.length === 0) {
    return primarySport ?? Sport.PADEL;
  }
  const current = primarySport ?? Sport.PADEL;
  return sportsEnabled.includes(current) ? current : sportsEnabled[0]!;
}

export function parseSportParam(input: unknown): Sport {
  const sport = resolveSport(input);
  assertSportImplemented(sport);
  return sport;
}

export type PublicGamesSportFilter =
  | { mode: 'all' }
  | { mode: 'single'; sport: Sport };

/** Find / public games: omit or primary → single sport; `all` → no filter. */
export function resolvePublicGamesSportFilter(
  sportQuery: unknown,
  primarySport: Sport | string | null | undefined,
): PublicGamesSportFilter {
  if (typeof sportQuery === 'string' && sportQuery.toLowerCase() === 'all') {
    return { mode: 'all' };
  }
  if (typeof sportQuery === 'string' && sportQuery.length > 0) {
    return { mode: 'single', sport: parseSportParam(sportQuery) };
  }
  const primary = resolveSport(primarySport ?? Sport.PADEL);
  assertSportImplemented(primary);
  return { mode: 'single', sport: primary };
}

export type LeaderboardSportMode =
  | { mode: 'all' }
  | { mode: 'sport'; sport: Sport };

/** Leaderboard level ranking: omit or primary → per-sport profile; `all` → each user's primary sport snapshot. */
export function resolveLeaderboardSportMode(
  sportQuery: unknown,
  primarySport: Sport | string | null | undefined,
): LeaderboardSportMode {
  if (typeof sportQuery === 'string' && sportQuery.toLowerCase() === 'all') {
    return { mode: 'all' };
  }
  if (typeof sportQuery === 'string' && sportQuery.length > 0) {
    return { mode: 'sport', sport: parseSportParam(sportQuery) };
  }
  const primary = resolveSport(primarySport ?? Sport.PADEL);
  assertSportImplemented(primary);
  return { mode: 'sport', sport: primary };
}

export function clampSportLevel(level: number): number {
  return Math.max(MIN_SPORT_LEVEL, Math.min(MAX_SPORT_LEVEL, level));
}

export function clampUserSportProfileGameStats(gamesPlayed: number, gamesWon: number) {
  return clampSportProfileGameStats(gamesPlayed, gamesWon);
}

export async function upsertPadelSportProfileFromUser(
  userId: string,
  data: { level?: number; reliability?: number; gamesPlayed?: number; gamesWon?: number },
): Promise<void> {
  const existing = await prisma.userSportProfile.findUnique({
    where: { userId_sport: { userId, sport: Sport.PADEL } },
    select: { level: true, reliability: true, gamesPlayed: true, gamesWon: true },
  });

  const gamesPlayed = data.gamesPlayed ?? existing?.gamesPlayed ?? 0;
  const gamesWon = data.gamesWon ?? existing?.gamesWon ?? 0;
  const clampedStats = clampUserSportProfileGameStats(gamesPlayed, gamesWon);

  await prisma.userSportProfile.upsert({
    where: { userId_sport: { userId, sport: Sport.PADEL } },
    create: {
      userId,
      sport: Sport.PADEL,
      level: data.level ?? existing?.level ?? DEFAULT_NEW_SPORT_LEVEL,
      reliability: data.reliability ?? existing?.reliability ?? 0,
      gamesPlayed: clampedStats.gamesPlayed,
      gamesWon: clampedStats.gamesWon,
    },
    update: {
      ...(data.level !== undefined ? { level: data.level } : {}),
      ...(data.reliability !== undefined ? { reliability: data.reliability } : {}),
      ...(data.gamesPlayed !== undefined || data.gamesWon !== undefined
        ? { gamesPlayed: clampedStats.gamesPlayed, gamesWon: clampedStats.gamesWon }
        : {}),
    },
  });
}

const EMPTY_SPORT_SNAPSHOT = {
  level: DEFAULT_NEW_SPORT_LEVEL,
  reliability: 0,
  ratingUncertainty: 0,
  lastRatingActivityAt: null as Date | null,
  gamesPlayed: 0,
  gamesWon: 0,
} as const;

/** Per-sport stats for rating/UI. Missing profile → default new-sport snapshot. */
export function resolveUserSportSnapshot(user: UserWithSportProfiles, sport: Sport): {
  level: number;
  reliability: number;
  ratingUncertainty: number;
  lastRatingActivityAt: Date | null;
  gamesPlayed: number;
  gamesWon: number;
} {
  const profile =
    'sportProfiles' in user ? user.sportProfiles?.find((p) => p.sport === sport) : undefined;
  if (profile) {
    return {
      level: profile.level,
      reliability: profile.reliability,
      ratingUncertainty:
        'ratingUncertainty' in profile && typeof profile.ratingUncertainty === 'number'
          ? profile.ratingUncertainty
          : 0,
      lastRatingActivityAt:
        'lastRatingActivityAt' in profile && profile.lastRatingActivityAt instanceof Date
          ? profile.lastRatingActivityAt
          : 'lastRatingActivityAt' in profile && profile.lastRatingActivityAt
            ? new Date(profile.lastRatingActivityAt as string | Date)
            : null,
      gamesPlayed: profile.gamesPlayed,
      gamesWon: profile.gamesWon,
    };
  }

  return { ...EMPTY_SPORT_SNAPSHOT };
}

/** Project `BasicUser` fields using the user's own primary sport (DM / non-game surfaces). */
export function projectUserByPrimarySport<T extends UserWithSportProfiles & { primarySport?: Sport | string | null }>(
  user: T,
): ProjectedUser<T> {
  const sport = resolveSport(user.primarySport ?? Sport.PADEL);
  return projectUserForSportContext(user, sport);
}

export async function resolveChatMessageSport(
  message: { chatContextType: string; contextId: string },
  viewerUserId: string,
): Promise<Sport> {
  if (message.chatContextType === 'GAME') {
    const game = await prisma.game.findUnique({
      where: { id: message.contextId },
      select: { sport: true },
    });
    return game?.sport ?? Sport.PADEL;
  }
  const viewer = await prisma.user.findUnique({
    where: { id: viewerUserId },
    select: { primarySport: true },
  });
  return resolveSport(viewer?.primarySport ?? Sport.PADEL);
}

export async function countRatedSportOutcomes(
  userId: string,
  sport: Sport,
  tx?: Prisma.TransactionClient,
): Promise<number> {
  const client = tx ?? prisma;
  return client.gameOutcome.count({
    where: {
      userId,
      game: { sport, affectsRating: true },
    },
  });
}

export async function countSportGamesParticipated(
  userId: string,
  sport: Sport,
  tx?: Prisma.TransactionClient,
): Promise<number> {
  const client = tx ?? prisma;
  return client.gameParticipant.count({
    where: {
      userId,
      status: 'PLAYING',
      game: { sport },
    },
  });
}

type SportProfileForRemoval = {
  level: number;
  reliability: number;
  gamesPlayed: number;
  gamesWon: number;
  levelSource: SportLevelSource;
  questionnaireCompletedAt: Date | null;
  questionnaireSkippedAt: Date | null;
  externalRatingHint: string | null;
};

/** True when the sport was only enabled in profile — safe to delete `UserSportProfile`. */
export function isUnusedSportProfile(
  profile: SportProfileForRemoval | null,
  sportGamesParticipated: number,
): boolean {
  if (!profile) return true;
  if (sportGamesParticipated > 0) return false;
  if (profile.gamesPlayed > 0 || profile.gamesWon > 0) return false;
  if (profile.questionnaireCompletedAt || profile.questionnaireSkippedAt) return false;
  if (profile.externalRatingHint) return false;
  if (profile.levelSource !== SportLevelSource.DEFAULT) return false;
  if (profile.level !== DEFAULT_NEW_SPORT_LEVEL || profile.reliability !== 0) return false;
  return true;
}

/** Keep `sportsEnabled` aligned when a sport profile is written (e.g. rated game). */
export async function ensureSportInEnabled(
  userId: string,
  sport: Sport,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const client = tx ?? prisma;
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { sportsEnabled: true },
  });
  if (!user) return;
  const enabled = user.sportsEnabled ?? [Sport.PADEL];
  if (enabled.includes(sport)) return;
  await client.user.update({
    where: { id: userId },
    data: { sportsEnabled: [...enabled, sport] },
  });
}

export function projectUserForSportContext<T extends UserWithSportProfiles | null | undefined>(
  user: T,
  sport: Sport,
): ProjectedUser<T> {
  if (!user) return user as ProjectedUser<T>;
  const userForSnapshot =
    'sportProfiles' in (user as object)
      ? user
      : ({ ...(user as UserWithSportProfiles), sportProfiles: [] } as UserWithSportProfiles);
  const snapshot = resolveUserSportSnapshot(userForSnapshot, sport);
  const rest = { ...(user as UserWithSportProfiles) };
  delete (rest as Record<string, unknown>).sportProfiles;
  return {
    ...rest,
    level: snapshot.level,
    reliability: snapshot.reliability,
    gamesPlayed: snapshot.gamesPlayed,
    gamesWon: snapshot.gamesWon,
  } as ProjectedUser<T>;
}

export async function loadProfileUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: PROFILE_SELECT_FIELDS,
  });
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  const enabled = user.sportsEnabled ?? [];
  if (enabled.length > 0) {
    const primarySport = reconcilePrimarySport(user.primarySport, enabled);
    if (primarySport !== user.primarySport) {
      await prisma.user.update({
        where: { id: userId },
        data: { primarySport },
      });
      user.primarySport = primarySport;
    }
  }
  const enriched = enrichProfileUser(user);
  return attachPlayStreaksToUser(enriched);
}

/** ADR-Q9: ensure per-sport profile exists when user joins a game (invite, booking, league assign). */
export async function ensureUserSportProfileForGame(userId: string, gameId: string): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { sport: true },
  });
  if (!game) return;

  const existing = await prisma.userSportProfile.findUnique({
    where: { userId_sport: { userId, sport: game.sport } },
  });
  if (existing) return;

  try {
    await addUserSport(userId, game.sport);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 400) return;
    throw err;
  }
}

export async function addUserSport(userId: string, sport: Sport) {
  assertSportImplemented(sport);

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { sportsEnabled: true, primarySport: true, sportProfiles: { select: { sport: true } } },
  });
  if (!existing) {
    throw new ApiError(404, 'User not found');
  }

  const enabled = new Set(existing.sportsEnabled ?? [Sport.PADEL]);
  enabled.add(sport);
  const sportsEnabled = Array.from(enabled);
  const primarySport = reconcilePrimarySport(existing.primarySport, sportsEnabled);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { sportsEnabled, primarySport },
    });

    const freshProfile = {
      level: DEFAULT_NEW_SPORT_LEVEL,
      reliability: 0,
      gamesPlayed: 0,
      gamesWon: 0,
      levelSource: SportLevelSource.DEFAULT,
    };

    await tx.userSportProfile.upsert({
      where: { userId_sport: { userId, sport } },
      create: {
        userId,
        sport,
        ...freshProfile,
      },
      update: {},
    });
  });

  const user = await loadProfileUser(userId);
  const profile = user.sportProfiles?.find((p) => p.sport === sport);
  const suggestedQuestionnaire = isQuestionnaireSuggestedForProfile(sport, profile);
  return { user, suggestedQuestionnaire };
}

/** First-time sports setup after profile name is set (login/register without explicit sport). */
export async function confirmInitialSportsSetup(
  userId: string,
  sports: Sport[],
  primarySport: Sport,
) {
  if (!sports.length) {
    throw new ApiError(400, 'At least one sport is required');
  }
  const enabled = [...new Set(sports)];
  if (enabled.length !== sports.length) {
    throw new ApiError(400, 'Duplicate sports are not allowed');
  }
  for (const sport of enabled) {
    assertSportImplemented(sport);
  }
  if (!enabled.includes(primarySport)) {
    throw new ApiError(400, 'Primary sport must be enabled');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      primarySportIsSet: true,
      sportProfiles: { select: { sport: true, gamesPlayed: true } },
    },
  });
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  if (user.primarySportIsSet) {
    throw new ApiError(400, 'Primary sport already set');
  }

  const freshProfile = {
    level: DEFAULT_NEW_SPORT_LEVEL,
    reliability: 0,
    gamesPlayed: 0,
    gamesWon: 0,
    levelSource: SportLevelSource.DEFAULT,
  };

  await prisma.$transaction(async (tx) => {
    const removable = (user.sportProfiles ?? []).filter(
      (p) => !enabled.includes(p.sport) && p.gamesPlayed === 0,
    );
    for (const p of removable) {
      await tx.userSportProfile.delete({
        where: { userId_sport: { userId, sport: p.sport } },
      });
    }

    for (const sport of enabled) {
      await tx.userSportProfile.upsert({
        where: { userId_sport: { userId, sport } },
        create: { userId, sport, ...freshProfile },
        update: {},
      });
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        primarySport,
        sportsEnabled: enabled,
        primarySportIsSet: true,
      },
    });
  });

  return loadProfileUser(userId);
}

export async function setUserPrimarySport(userId: string, sport: Sport) {
  assertSportImplemented(sport);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sportsEnabled: true },
  });
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const enabled = user.sportsEnabled ?? [Sport.PADEL];
  if (!enabled.includes(sport)) {
    throw new ApiError(400, 'Sport must be enabled before setting as primary');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { primarySport: sport },
  });

  return loadProfileUser(userId);
}

export async function updateUserSportLevel(userId: string, sport: Sport, level: number) {
  assertSportImplemented(sport);

  if (typeof level !== 'number' || level < MIN_SPORT_LEVEL || level > MAX_SPORT_LEVEL) {
    throw new ApiError(400, `Level must be a number between ${MIN_SPORT_LEVEL} and ${MAX_SPORT_LEVEL}`);
  }

  const clampedLevel = clampSportLevel(level);

  const profile = await prisma.userSportProfile.findUnique({
    where: { userId_sport: { userId, sport } },
    select: { gamesPlayed: true },
  });
  if (!profile) {
    throw new ApiError(404, 'Sport profile not found');
  }
  if (profile.gamesPlayed > 0) {
    throw new ApiError(400, 'Cannot change level after playing rated games in this sport');
  }

  await prisma.userSportProfile.update({
    where: { userId_sport: { userId, sport } },
    data: { level: clampedLevel, levelSource: SportLevelSource.MANUAL },
  });

  return loadProfileUser(userId);
}

export async function removeUserSport(userId: string, sport: Sport) {
  assertSportImplemented(sport);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      sportsEnabled: true,
      primarySport: true,
      sportProfiles: { select: { sport: true } },
    },
  });
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const enabled = [...(user.sportsEnabled ?? [])];
  if (!enabled.includes(sport)) {
    throw new ApiError(400, 'Sport is not enabled');
  }
  if (enabled.length <= 1) {
    throw new ApiError(400, 'At least one sport must remain enabled');
  }

  const profile = await prisma.userSportProfile.findUnique({
    where: { userId_sport: { userId, sport } },
    select: {
      level: true,
      reliability: true,
      gamesPlayed: true,
      gamesWon: true,
      levelSource: true,
      questionnaireCompletedAt: true,
      questionnaireSkippedAt: true,
      externalRatingHint: true,
    },
  });

  const sportsEnabled = enabled.filter((s) => s !== sport);
  const primarySport = reconcilePrimarySport(user.primarySport, sportsEnabled);

  await prisma.$transaction(async (tx) => {
    const sportGamesParticipated = await countSportGamesParticipated(userId, sport, tx);
    const deleteProfile = isUnusedSportProfile(profile, sportGamesParticipated);

    await tx.user.update({
      where: { id: userId },
      data: { sportsEnabled, primarySport },
    });

    if (deleteProfile) {
      await tx.userSportProfile.deleteMany({
        where: { userId, sport },
      });
    }
  });

  return loadProfileUser(userId);
}

export { getImplementedSports };
