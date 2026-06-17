import { Prisma, Sport } from '@prisma/client';
import prisma from '../config/database';
import {
  RELIABILITY_DECAY_GRACE_DAYS,
  RELIABILITY_DECAY_LAMBDA,
  RELIABILITY_DECAY_MAX_DELTA_DAYS,
  RELIABILITY_DECAY_MIN_GAMES,
} from '../config/reliabilityDecay';
import {
  lastActivityAtSelect,
  reliabilityDecayPadelActivityArms,
} from './reliabilityDecayActivitySql';

const MS_PER_DAY = 86_400_000;

type DecayCandidateRow = {
  id: string;
  reliability: number;
  reliabilityDecayPostGraceDaysApplied: number;
  updatedAt: Date;
  profileUpdatedAt: Date;
  lastActivityAt: Date | null;
};

async function fetchDecayCandidates(): Promise<DecayCandidateRow[]> {
  return prisma.$queryRaw<DecayCandidateRow[]>(
    Prisma.sql`
      WITH eligible AS (
        SELECT
          u.id,
          p.reliability,
          u."reliabilityDecayPostGraceDaysApplied",
          u."updatedAt",
          p."updatedAt" AS "profileUpdatedAt"
        FROM "User" u
        INNER JOIN "UserSportProfile" p ON p."userId" = u.id AND p.sport = ${Sport.PADEL}::"Sport"
        WHERE u."isActive" = true
          AND p."gamesPlayed" >= ${RELIABILITY_DECAY_MIN_GAMES}
          AND p.reliability > 0
      ),
      ${reliabilityDecayPadelActivityArms}
      SELECT
        e.id,
        e.reliability,
        e."reliabilityDecayPostGraceDaysApplied",
        e."updatedAt",
        e."profileUpdatedAt",
        ${lastActivityAtSelect}
      FROM eligible e
      LEFT JOIN outcome_times o ON o.uid = e.id
      LEFT JOIN game_times gt ON gt.uid = e.id
    `
  );
}

async function lastReliabilityActivityAtForUser(userId: string): Promise<Date | null> {
  const rows = await prisma.$queryRaw<Array<{ lastActivityAt: Date | null }>>(
    Prisma.sql`
      WITH eligible AS (
        SELECT u.id
        FROM "User" u
        INNER JOIN "UserSportProfile" p ON p."userId" = u.id AND p.sport = ${Sport.PADEL}::"Sport"
        WHERE u.id = ${userId}
          AND u."isActive" = true
          AND p."gamesPlayed" >= ${RELIABILITY_DECAY_MIN_GAMES}
          AND p.reliability > 0
      ),
      ${reliabilityDecayPadelActivityArms}
      SELECT
        ${lastActivityAtSelect}
      FROM eligible e
      LEFT JOIN outcome_times o ON o.uid = e.id
      LEFT JOIN game_times gt ON gt.uid = e.id
    `
  );
  return rows[0]?.lastActivityAt ?? null;
}

function decayPayload(
  reliability: number,
  reliabilityDecayPostGraceDaysApplied: number,
  lastActivityAt: Date,
  nowMs: number
): { newRel: number; newApplied: number } | null {
  const idleDays = Math.floor((nowMs - lastActivityAt.getTime()) / MS_PER_DAY);
  const postGrace = Math.max(0, idleDays - RELIABILITY_DECAY_GRACE_DAYS);
  const applied = reliabilityDecayPostGraceDaysApplied;
  let delta = postGrace - applied;
  if (delta <= 0) return null;
  if (delta > RELIABILITY_DECAY_MAX_DELTA_DAYS) {
    delta = RELIABILITY_DECAY_MAX_DELTA_DAYS;
  }
  const newRel = Math.max(
    0,
    Math.min(100, reliability * Math.exp(-RELIABILITY_DECAY_LAMBDA * delta))
  );
  return { newRel, newApplied: applied + delta };
}

async function tryDecayWrite(
  userId: string,
  expectedUserUpdatedAt: Date,
  expectedProfileUpdatedAt: Date,
  newRel: number,
  newApplied: number
): Promise<boolean> {
  const [userResult, profileResult] = await prisma.$transaction([
    prisma.user.updateMany({
      where: { id: userId, updatedAt: expectedUserUpdatedAt },
      data: {
        reliabilityDecayPostGraceDaysApplied: newApplied,
      },
    }),
    prisma.userSportProfile.updateMany({
      where: {
        userId,
        sport: Sport.PADEL,
        updatedAt: expectedProfileUpdatedAt,
      },
      data: { reliability: newRel },
    }),
  ]);
  return userResult.count > 0 && profileResult.count > 0;
}

export async function runReliabilityIdleDecay(): Promise<number> {
  const candidates = await fetchDecayCandidates();

  let updated = 0;
  for (const u of candidates) {
    const last = u.lastActivityAt;
    if (!last) continue;

    const nowMs = Date.now();
    const payload = decayPayload(
      u.reliability,
      u.reliabilityDecayPostGraceDaysApplied,
      last,
      nowMs
    );
    if (!payload) continue;

    const wrote = await tryDecayWrite(
      u.id,
      u.updatedAt,
      u.profileUpdatedAt,
      payload.newRel,
      payload.newApplied,
    );
    if (wrote) {
      updated += 1;
      continue;
    }

    const [row, profile] = await Promise.all([
      prisma.user.findUnique({
        where: { id: u.id },
        select: {
          reliabilityDecayPostGraceDaysApplied: true,
          updatedAt: true,
          isActive: true,
        },
      }),
      prisma.userSportProfile.findUnique({
        where: { userId_sport: { userId: u.id, sport: Sport.PADEL } },
        select: { reliability: true, gamesPlayed: true, updatedAt: true },
      }),
    ]);
    if (
      !row?.isActive ||
      !profile ||
      profile.gamesPlayed < RELIABILITY_DECAY_MIN_GAMES ||
      profile.reliability <= 0
    ) {
      continue;
    }
    const last2 = await lastReliabilityActivityAtForUser(u.id);
    if (!last2) continue;
    const nowRetry = Date.now();
    const payload2 = decayPayload(
      profile.reliability,
      row.reliabilityDecayPostGraceDaysApplied,
      last2,
      nowRetry
    );
    if (!payload2) continue;
    if (
      await tryDecayWrite(
        u.id,
        row.updatedAt,
        profile.updatedAt,
        payload2.newRel,
        payload2.newApplied,
      )
    ) {
      updated += 1;
    }
  }

  return updated;
}
