import { WorkoutSessionSource } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { hasRealParticipantStatus } from '../../utils/parentGamePermissions';

export interface UpsertGameWorkoutInput {
  durationSeconds: number;
  totalEnergyKcal?: number | null;
  avgHeartRate?: number | null;
  maxHeartRate?: number | null;
  startedAt: Date;
  endedAt: Date;
  source?: WorkoutSessionSource;
  healthExternalId?: string | null;
}

const MAX_DURATION_SECONDS = 86400;
const MAX_KCAL = 5000;
const HR_MIN = 35;
const HR_MAX = 250;

/** Validates payload; returns duration in seconds derived from timestamps (stored value). */
function validatedDurationSeconds(input: UpsertGameWorkoutInput): number {
  if (input.endedAt.getTime() < input.startedAt.getTime()) {
    throw new ApiError(400, 'endedAt must be after startedAt');
  }
  const computed = Math.max(1, Math.floor((input.endedAt.getTime() - input.startedAt.getTime()) / 1000));
  if (computed > MAX_DURATION_SECONDS) {
    throw new ApiError(400, 'Session duration too long');
  }
  if (!Number.isFinite(input.durationSeconds)) {
    throw new ApiError(400, 'Invalid durationSeconds');
  }
  const tolerance = Math.max(3, Math.floor(computed * 0.02));
  if (Math.abs(computed - input.durationSeconds) > tolerance) {
    throw new ApiError(400, 'durationSeconds inconsistent with startedAt and endedAt');
  }
  if (input.totalEnergyKcal != null) {
    if (!Number.isFinite(input.totalEnergyKcal) || input.totalEnergyKcal < 0 || input.totalEnergyKcal > MAX_KCAL) {
      throw new ApiError(400, 'Invalid totalEnergyKcal');
    }
  }
  for (const [label, v] of [
    ['avgHeartRate', input.avgHeartRate],
    ['maxHeartRate', input.maxHeartRate],
  ] as const) {
    if (v != null && (!Number.isFinite(v) || v < HR_MIN || v > HR_MAX)) {
      throw new ApiError(400, `Invalid ${label}`);
    }
  }
  return computed;
}

export class GameWorkoutService {
  static async upsertForParticipant(gameId: string, userId: string, input: UpsertGameWorkoutInput) {
    const durationSeconds = validatedDurationSeconds(input);

    const allowed = await hasRealParticipantStatus(gameId, userId);
    if (!allowed) {
      throw new ApiError(403, 'Only participants can save workout data for this game');
    }

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true, status: true },
    });
    if (!game) {
      throw new ApiError(404, 'Game not found');
    }
    if (game.status === 'ARCHIVED') {
      throw new ApiError(400, 'Cannot attach workout to archived game');
    }

    const source = input.source ?? WorkoutSessionSource.APPLE_WATCH;

    return prisma.gameWorkoutSummary.upsert({
      where: {
        gameId_userId: { gameId, userId },
      },
      create: {
        gameId,
        userId,
        source,
        durationSeconds,
        totalEnergyKcal: input.totalEnergyKcal ?? undefined,
        avgHeartRate: input.avgHeartRate ?? undefined,
        maxHeartRate: input.maxHeartRate ?? undefined,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        healthExternalId: input.healthExternalId ?? undefined,
      },
      update: {
        source,
        durationSeconds,
        totalEnergyKcal: input.totalEnergyKcal ?? undefined,
        avgHeartRate: input.avgHeartRate ?? undefined,
        maxHeartRate: input.maxHeartRate ?? undefined,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        healthExternalId: input.healthExternalId ?? undefined,
      },
    });
  }

  static async getMineForGame(gameId: string, userId: string) {
    const allowed = await hasRealParticipantStatus(gameId, userId);
    if (!allowed) {
      throw new ApiError(403, 'Access denied');
    }
    return prisma.gameWorkoutSummary.findUnique({
      where: {
        gameId_userId: { gameId, userId },
      },
    });
  }

  static async listForUser(
    userId: string,
    opts: { limit: number; from?: Date; to?: Date }
  ) {
    return prisma.gameWorkoutSummary.findMany({
      where: {
        userId,
        ...(opts.from || opts.to
          ? {
              endedAt: {
                ...(opts.from ? { gte: opts.from } : {}),
                ...(opts.to ? { lte: opts.to } : {}),
              },
            }
          : {}),
      },
      orderBy: { endedAt: 'desc' },
      take: opts.limit,
      include: {
        game: {
          select: {
            id: true,
            name: true,
            gameType: true,
            startTime: true,
            club: { select: { id: true, name: true, avatar: true } },
          },
        },
      },
    });
  }
}
