import dotenv from 'dotenv';
dotenv.config();

import { LevelChangeEventType, Prisma, Sport } from '@prisma/client';
import prisma from '../src/config/database';

const LEVEL_EPS = 1e-6;
const RELIABILITY_EPS = 1e-6;

const SPORT_LEVEL_EVENT_TYPES: LevelChangeEventType[] = [
  LevelChangeEventType.GAME,
  LevelChangeEventType.SET,
  LevelChangeEventType.QUESTIONNAIRE,
  LevelChangeEventType.LUNDA,
  LevelChangeEventType.OTHER,
];

type LevelDriftRow = {
  userId: string;
  sport: Sport;
  profileLevel: number;
  eventLevel: number;
  eventId: string;
  eventType: LevelChangeEventType;
  eventAt: Date;
};

type ReliabilityDriftRow = {
  userId: string;
  sport: Sport;
  profileReliability: number;
  outcomeReliability: number;
  outcomeId: string;
  gameId: string;
  outcomeAt: Date;
};

type ProfilePatch = {
  userId: string;
  sport: Sport;
  level?: number;
  reliability?: number;
  notes: string[];
};

async function findLevelDrifts(limit?: number): Promise<LevelDriftRow[]> {
  const limitClause = limit != null ? Prisma.sql`LIMIT ${limit}` : Prisma.empty;

  return prisma.$queryRaw<LevelDriftRow[]>`
    WITH latest_event AS (
      SELECT DISTINCT ON (lce."userId", lce.sport)
        lce."userId",
        lce.sport,
        lce."levelAfter" AS "eventLevel",
        lce.id AS "eventId",
        lce."eventType",
        lce."createdAt" AS "eventAt"
      FROM "LevelChangeEvent" lce
      WHERE lce.sport IS NOT NULL
        AND lce."eventType"::text IN (${Prisma.join(SPORT_LEVEL_EVENT_TYPES)})
      ORDER BY lce."userId", lce.sport, lce."createdAt" DESC
    )
    SELECT
      p."userId",
      p.sport,
      p.level AS "profileLevel",
      le."eventLevel",
      le."eventId",
      le."eventType",
      le."eventAt"
    FROM "UserSportProfile" p
    INNER JOIN latest_event le
      ON le."userId" = p."userId" AND le.sport = p.sport
    WHERE ABS(p.level - le."eventLevel") > ${LEVEL_EPS}
    ORDER BY le."eventAt" DESC
    ${limitClause}
  `;
}

async function findReliabilityDrifts(limit?: number): Promise<ReliabilityDriftRow[]> {
  const limitClause = limit != null ? Prisma.sql`LIMIT ${limit}` : Prisma.empty;

  return prisma.$queryRaw<ReliabilityDriftRow[]>`
    WITH latest_outcome AS (
      SELECT DISTINCT ON (go."userId", g.sport)
        go."userId",
        g.sport,
        go."reliabilityAfter" AS "outcomeReliability",
        go.id AS "outcomeId",
        go."gameId",
        go."createdAt" AS "outcomeAt"
      FROM "GameOutcome" go
      INNER JOIN "Game" g ON g.id = go."gameId"
      ORDER BY go."userId", g.sport, go."createdAt" DESC
    )
    SELECT
      p."userId",
      p.sport,
      p.reliability AS "profileReliability",
      lo."outcomeReliability",
      lo."outcomeId",
      lo."gameId",
      lo."outcomeAt"
    FROM "UserSportProfile" p
    INNER JOIN latest_outcome lo
      ON lo."userId" = p."userId" AND lo.sport = p.sport
    WHERE ABS(p.reliability - lo."outcomeReliability") > ${RELIABILITY_EPS}
    ORDER BY lo."outcomeAt" DESC
    ${limitClause}
  `;
}

function mergePatches(
  levelDrifts: LevelDriftRow[],
  reliabilityDrifts: ReliabilityDriftRow[],
): ProfilePatch[] {
  const byKey = new Map<string, ProfilePatch>();

  for (const row of levelDrifts) {
    const key = `${row.userId}:${row.sport}`;
    const patch = byKey.get(key) ?? {
      userId: row.userId,
      sport: row.sport,
      notes: [],
    };
    patch.level = row.eventLevel;
    patch.notes.push(
      `level ${row.profileLevel.toFixed(6)} -> ${row.eventLevel.toFixed(6)} (${row.eventType} ${row.eventId})`,
    );
    byKey.set(key, patch);
  }

  for (const row of reliabilityDrifts) {
    const key = `${row.userId}:${row.sport}`;
    const patch = byKey.get(key) ?? {
      userId: row.userId,
      sport: row.sport,
      notes: [],
    };
    patch.reliability = row.outcomeReliability;
    patch.notes.push(
      `reliability ${row.profileReliability.toFixed(6)} -> ${row.outcomeReliability.toFixed(6)} (outcome ${row.outcomeId} game ${row.gameId})`,
    );
    byKey.set(key, patch);
  }

  return [...byKey.values()];
}

async function applyPatches(patches: ProfilePatch[]): Promise<number> {
  let updated = 0;

  for (const patch of patches) {
    const data: { level?: number; reliability?: number } = {};
    if (patch.level != null) data.level = patch.level;
    if (patch.reliability != null) data.reliability = patch.reliability;
    if (Object.keys(data).length === 0) continue;

    await prisma.userSportProfile.update({
      where: { userId_sport: { userId: patch.userId, sport: patch.sport } },
      data,
    });
    updated += 1;
  }

  return updated;
}

export async function reconcileSportProfilesFromEvents(options: {
  apply: boolean;
  limit?: number;
}): Promise<{ patchCount: number; updated: number }> {
  const [levelDrifts, reliabilityDrifts] = await Promise.all([
    findLevelDrifts(options.limit),
    findReliabilityDrifts(options.limit),
  ]);
  const patches = mergePatches(levelDrifts, reliabilityDrifts);

  console.log(
    options.apply
      ? `Applying ${patches.length} profile patch(es) (${levelDrifts.length} level, ${reliabilityDrifts.length} reliability)...`
      : `Dry run: ${patches.length} profile patch(es) — level drift ${levelDrifts.length}, reliability drift ${reliabilityDrifts.length} (pass --apply to write)`,
  );

  for (const patch of patches) {
    console.log([patch.userId, patch.sport, ...patch.notes].join(' | '));
  }

  if (!options.apply) {
    if (patches.length > 0) {
      console.log('No changes written. Re-run with --apply');
    }
    return { patchCount: patches.length, updated: 0 };
  }

  const updated = await applyPatches(patches);
  console.log(`Updated ${updated} profile(s).`);
  return { patchCount: patches.length, updated };
}

function parseArgs(argv: string[]) {
  const apply = argv.includes('--apply');
  const limitArg = argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number.parseInt(limitArg.split('=')[1] ?? '', 10) : undefined;
  if (limit != null && (!Number.isFinite(limit) || limit < 1)) {
    throw new Error('Invalid --limit= value');
  }
  return { apply, limit };
}

async function main() {
  const { apply, limit } = parseArgs(process.argv.slice(2));
  await reconcileSportProfilesFromEvents({ apply, limit });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
