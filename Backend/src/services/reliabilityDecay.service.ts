import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import {
  RELIABILITY_DECAY_GRACE_DAYS,
  RELIABILITY_DECAY_LAMBDA,
  RELIABILITY_DECAY_MAX_DELTA_DAYS,
  RELIABILITY_DECAY_MIN_GAMES,
} from '../config/reliabilityDecay';
import { lastActivityAtSelect, reliabilityDecayActivityArms } from './reliabilityDecayActivitySql';

const MS_PER_DAY = 86_400_000;

type DecayCandidateRow = {
  id: string;
  reliability: number;
  reliabilityDecayPostGraceDaysApplied: number;
  updatedAt: Date;
  lastActivityAt: Date | null;
};

async function fetchDecayCandidates(): Promise<DecayCandidateRow[]> {
  return prisma.$queryRaw<DecayCandidateRow[]>(
    Prisma.sql`
      WITH eligible AS (
        SELECT
          u.id,
          u."reliability",
          u."reliabilityDecayPostGraceDaysApplied",
          u."updatedAt"
        FROM "User" u
        WHERE u."isActive" = true
          AND u."gamesPlayed" >= ${RELIABILITY_DECAY_MIN_GAMES}
          AND u."reliability" > 0
      ),
      ${reliabilityDecayActivityArms}
      SELECT
        e.id,
        e."reliability",
        e."reliabilityDecayPostGraceDaysApplied",
        e."updatedAt",
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
        WHERE u.id = ${userId}
          AND u."isActive" = true
          AND u."gamesPlayed" >= ${RELIABILITY_DECAY_MIN_GAMES}
          AND u."reliability" > 0
      ),
      ${reliabilityDecayActivityArms}
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
  expectedUpdatedAt: Date,
  newRel: number,
  newApplied: number
): Promise<boolean> {
  const result = await prisma.user.updateMany({
    where: { id: userId, updatedAt: expectedUpdatedAt },
    data: {
      reliability: newRel,
      reliabilityDecayPostGraceDaysApplied: newApplied,
    },
  });
  return result.count > 0;
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

    const wrote = await tryDecayWrite(u.id, u.updatedAt, payload.newRel, payload.newApplied);
    if (wrote) {
      updated += 1;
      continue;
    }

    const row = await prisma.user.findUnique({
      where: { id: u.id },
      select: {
        reliability: true,
        reliabilityDecayPostGraceDaysApplied: true,
        updatedAt: true,
        isActive: true,
        gamesPlayed: true,
      },
    });
    if (!row?.isActive || row.gamesPlayed < RELIABILITY_DECAY_MIN_GAMES || row.reliability <= 0) {
      continue;
    }
    const last2 = await lastReliabilityActivityAtForUser(u.id);
    if (!last2) continue;
    const nowRetry = Date.now();
    const payload2 = decayPayload(
      row.reliability,
      row.reliabilityDecayPostGraceDaysApplied,
      last2,
      nowRetry
    );
    if (!payload2) continue;
    if (await tryDecayWrite(u.id, row.updatedAt, payload2.newRel, payload2.newApplied)) {
      updated += 1;
    }
  }

  return updated;
}
