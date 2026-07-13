import { Prisma, Sport, EntityType } from '@prisma/client';
import prisma from '../../config/database';
import { getUserTimezone } from '../user-timezone.service';
import { resolveSport } from '../../sport/sportRegistry';
import {
  readRatingStatsAppliedFromMetadata,
  readSportStatsDeltasFromMetadata,
} from './outcomeStatsSnapshot';
import { countsForPlayStreak } from './ratingActivity';
import {
  projectPlayStreak,
  recomputePlayStreak,
  type PlayStreakState,
  type PlayStreakView,
} from './playStreak';

export const PLAY_STREAK_APPLIED_KEY = 'playStreakApplied';
export const PLAY_STREAK_ADVANCED_KEY = 'playStreakAdvanced';
export const PLAY_STREAK_BEFORE_KEY = 'playStreakBefore';
export const PLAY_STREAK_AFTER_KEY = 'playStreakAfter';

export type PlayStreakSnapshotMeta = {
  count: number;
  best: number;
  lastPlayAt: string | null;
};

function readMetadataRecord(
  metadata: Prisma.JsonValue | null | undefined,
): Record<string, unknown> | undefined {
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }
  return metadata as Record<string, unknown>;
}

export function mergePlayStreakMetadata(
  existing: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined,
  payload: {
    applied: boolean;
    advanced: boolean;
    before: PlayStreakSnapshotMeta;
    after: PlayStreakSnapshotMeta;
  },
): Prisma.InputJsonValue {
  const base: Record<string, unknown> =
    existing != null && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  base[PLAY_STREAK_APPLIED_KEY] = payload.applied;
  base[PLAY_STREAK_ADVANCED_KEY] = payload.advanced;
  base[PLAY_STREAK_BEFORE_KEY] = payload.before;
  base[PLAY_STREAK_AFTER_KEY] = payload.after;
  return base as Prisma.InputJsonValue;
}

export function readPlayStreakAppliedFromMetadata(
  metadata: Prisma.JsonValue | null | undefined,
): boolean {
  return readMetadataRecord(metadata)?.[PLAY_STREAK_APPLIED_KEY] === true;
}

export function readPlayStreakAdvancedFromMetadata(
  metadata: Prisma.JsonValue | null | undefined,
): boolean {
  return readMetadataRecord(metadata)?.[PLAY_STREAK_ADVANCED_KEY] === true;
}

function outcomeQualifiesForPlayStreak(
  metadata: Prisma.JsonValue | null | undefined,
  game: { affectsRating: boolean; entityType: EntityType },
): boolean {
  if (!countsForPlayStreak(game)) return false;
  const deltas = readSportStatsDeltasFromMetadata(metadata);
  if (deltas) return deltas.gamesPlayedDelta > 0;
  const flag = readRatingStatsAppliedFromMetadata(metadata);
  if (flag === true) return true;
  if (flag === false) return false;
  return game.affectsRating;
}

export async function loadQualifyingPlayAts(
  userId: string,
  sport: Sport,
  tx: Prisma.TransactionClient | typeof prisma,
  options?: { excludeGameId?: string },
): Promise<Date[]> {
  const outcomes = await tx.gameOutcome.findMany({
    where: {
      userId,
      game: {
        sport,
        affectsRating: true,
        entityType: { notIn: [EntityType.BAR, EntityType.LEAGUE_SEASON] },
      },
      ...(options?.excludeGameId ? { gameId: { not: options.excludeGameId } } : {}),
    },
    select: {
      createdAt: true,
      metadata: true,
      game: {
        select: {
          affectsRating: true,
          entityType: true,
          finishedDate: true,
          endTime: true,
          startTime: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return outcomes
    .filter((o) => outcomeQualifiesForPlayStreak(o.metadata, o.game))
    .map((o) => o.game.finishedDate ?? o.game.endTime ?? o.game.startTime ?? o.createdAt)
    .sort((a, b) => a.getTime() - b.getTime());
}

/** Attach derived playStreak views (at-risk only for self). */
export async function attachPlayStreaksToUser<
  T extends {
    id: string;
    primarySport?: Sport | string | null;
    sportProfiles?: Array<{
      sport: Sport | string;
      playStreakCount?: number;
      playStreakBest?: number;
      playStreakLastPlayAt?: Date | null;
      playStreak?: PlayStreakView;
    }>;
  },
>(user: T, options?: { persistBroken?: boolean }): Promise<T & { playStreak: PlayStreakView }> {
  const timezone = await getUserTimezone(user.id);
  const now = new Date();
  const sportProfiles = (user.sportProfiles ?? []).map((p) => {
    const fields = {
      count: p.playStreakCount ?? 0,
      best: p.playStreakBest ?? 0,
      lastPlayAt: p.playStreakLastPlayAt ?? null,
    };
    const playStreak = projectPlayStreak(fields, timezone, now, { includeAtRisk: true });
    return { ...p, playStreak };
  });
  const primary = resolveSport(user.primarySport ?? Sport.PADEL);
  const primaryProfile = sportProfiles.find((p) => p.sport === primary) ?? sportProfiles[0];
  const topFields = {
    count: primaryProfile?.playStreakCount ?? 0,
    best: primaryProfile?.playStreakBest ?? 0,
    lastPlayAt: primaryProfile?.playStreakLastPlayAt ?? null,
  };
  const playStreak =
    primaryProfile?.playStreak ??
    projectPlayStreak(topFields, timezone, now, { includeAtRisk: true });
  if (options?.persistBroken !== false) {
    await maybePersistBrokenPlayStreak(user.id, primary, topFields, playStreak);
  }
  return { ...user, sportProfiles, playStreak };
}

export async function recomputePlayStreakForUserSport(
  userId: string,
  sport: Sport,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<PlayStreakState> {
  const timezone = await getUserTimezone(userId);
  const playAts = await loadQualifyingPlayAts(userId, sport, tx);
  const state = recomputePlayStreak(playAts, timezone);

  await tx.userSportProfile.upsert({
    where: { userId_sport: { userId, sport } },
    create: {
      userId,
      sport,
      playStreakCount: state.count,
      playStreakBest: state.best,
      playStreakLastPlayAt: state.lastPlayAt,
      playStreakWeekStartAt: state.weekStartAt,
    },
    update: {
      playStreakCount: state.count,
      playStreakBest: state.best,
      playStreakLastPlayAt: state.lastPlayAt,
      playStreakWeekStartAt: state.weekStartAt,
    },
  });

  return state;
}

export async function buildPlayStreakViewForUser(params: {
  userId: string;
  count: number;
  best: number;
  lastPlayAt: Date | null;
  viewerUserId?: string | null;
  now?: Date;
}): Promise<PlayStreakView> {
  const timezone = await getUserTimezone(params.userId);
  const includeAtRisk = !!params.viewerUserId && params.viewerUserId === params.userId;
  return projectPlayStreak(
    {
      count: params.count,
      best: params.best,
      lastPlayAt: params.lastPlayAt,
    },
    timezone,
    params.now ?? new Date(),
    { includeAtRisk },
  );
}

export async function maybePersistBrokenPlayStreak(
  userId: string,
  sport: Sport,
  fields: { count: number; best: number; lastPlayAt: Date | null },
  view: PlayStreakView,
): Promise<void> {
  if (fields.count > 0 && view.current === 0) {
    await prisma.userSportProfile.updateMany({
      where: { userId, sport, playStreakCount: { gt: 0 } },
      data: { playStreakCount: 0 },
    });
  }
}
