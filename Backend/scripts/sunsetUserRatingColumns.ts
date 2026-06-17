import dotenv from 'dotenv';
dotenv.config();

import { Prisma, Sport } from '@prisma/client';
import prisma from '../src/config/database';
import { reconcileSportProfilesFromEvents } from './reconcileSportProfileLevelFromEvents';

const FIELD_EPS = 1e-6;

type BootstrapCandidate = {
  id: string;
  isActive: boolean;
  sportsEnabled: Sport[];
  level: number;
  reliability: number;
  gamesPlayed: number;
  gamesWon: number;
};

type UserColumnDriftRow = {
  userId: string;
  userLevel: number;
  profileLevel: number;
  userReliability: number;
  profileReliability: number;
  userGamesPlayed: number;
  profileGamesPlayed: number;
  userGamesWon: number;
  profileGamesWon: number;
};

function parseArgs(argv: string[]) {
  const apply = argv.includes('--apply');
  const limitArg = argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number.parseInt(limitArg.split('=')[1] ?? '', 10) : undefined;
  if (limit != null && (!Number.isFinite(limit) || limit < 1)) {
    throw new Error('Invalid --limit= value');
  }
  return { apply, limit };
}

async function userRatingColumnsExist(): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'padelpulse'
        AND table_name = 'User'
        AND column_name = 'level'
    ) AS "exists"
  `;
  return rows[0]?.exists === true;
}

async function findBootstrapCandidates(limit?: number): Promise<BootstrapCandidate[]> {
  const limitClause = limit != null ? Prisma.sql`LIMIT ${limit}` : Prisma.empty;

  return prisma.$queryRaw<BootstrapCandidate[]>`
    SELECT
      u.id,
      u."isActive",
      u."sportsEnabled",
      u.level,
      u.reliability,
      u."gamesPlayed",
      u."gamesWon"
    FROM "User" u
    WHERE NOT EXISTS (
      SELECT 1 FROM "UserSportProfile" p
      WHERE p."userId" = u.id AND p.sport = 'PADEL'
    )
    AND (u."isActive" = true OR 'PADEL' = ANY(u."sportsEnabled"))
    ORDER BY u."createdAt" ASC
    ${limitClause}
  `;
}

async function findUserColumnDrifts(limit?: number): Promise<UserColumnDriftRow[]> {
  const limitClause = limit != null ? Prisma.sql`LIMIT ${limit}` : Prisma.empty;

  return prisma.$queryRaw<UserColumnDriftRow[]>`
    SELECT
      u.id AS "userId",
      u.level AS "userLevel",
      p.level AS "profileLevel",
      u.reliability AS "userReliability",
      p.reliability AS "profileReliability",
      u."gamesPlayed" AS "userGamesPlayed",
      p."gamesPlayed" AS "profileGamesPlayed",
      u."gamesWon" AS "userGamesWon",
      p."gamesWon" AS "profileGamesWon"
    FROM "User" u
    INNER JOIN "UserSportProfile" p
      ON p."userId" = u.id AND p.sport = 'PADEL'
    WHERE ABS(u.level - p.level) > ${FIELD_EPS}
       OR ABS(u.reliability - p.reliability) > ${FIELD_EPS}
       OR u."gamesPlayed" <> p."gamesPlayed"
       OR u."gamesWon" <> p."gamesWon"
    ORDER BY u."createdAt" ASC
    ${limitClause}
  `;
}

async function applyBootstrap(candidates: BootstrapCandidate[]): Promise<number> {
  let created = 0;
  for (const user of candidates) {
    await prisma.userSportProfile.create({
      data: {
        userId: user.id,
        sport: Sport.PADEL,
        level: user.level,
        reliability: user.reliability,
        gamesPlayed: user.gamesPlayed,
        gamesWon: user.gamesWon,
      },
    });
    created += 1;
  }
  return created;
}

function logBootstrapCandidates(candidates: BootstrapCandidate[]) {
  console.log(`PADEL profile bootstrap candidates: ${candidates.length}`);
  for (const user of candidates) {
    console.log(
      [
        user.id,
        user.isActive ? 'active' : 'inactive',
        `level=${user.level}`,
        `reliability=${user.reliability}`,
        `gp=${user.gamesPlayed}`,
        `gw=${user.gamesWon}`,
      ].join(' | '),
    );
  }
}

function logUserColumnDrifts(drifts: UserColumnDriftRow[]) {
  console.log(`User-column drift rows (profile wins at cutover): ${drifts.length}`);
  for (const row of drifts) {
    console.log(
      [
        row.userId,
        `level ${row.userLevel}→${row.profileLevel}`,
        `rel ${row.userReliability}→${row.profileReliability}`,
        `gp ${row.userGamesPlayed}→${row.profileGamesPlayed}`,
        `gw ${row.userGamesWon}→${row.profileGamesWon}`,
      ].join(' | '),
    );
  }
}

async function main() {
  const { apply, limit } = parseArgs(process.argv.slice(2));

  console.log('=== Step 1: Event → profile reconciliation ===');
  const eventResult = await reconcileSportProfilesFromEvents({ apply, limit });

  console.log('\n=== Step 2: PADEL profile bootstrap from legacy User columns ===');
  const legacyColumns = await userRatingColumnsExist();
  let bootstrapCandidates: BootstrapCandidate[] = [];
  let bootstrapped = 0;
  if (!legacyColumns) {
    console.log('User rating columns already dropped — bootstrap skipped.');
  } else {
    bootstrapCandidates = await findBootstrapCandidates(limit);
    logBootstrapCandidates(bootstrapCandidates);

    if (apply && bootstrapCandidates.length > 0) {
      bootstrapped = await applyBootstrap(bootstrapCandidates);
      console.log(`Created ${bootstrapped} PADEL profile(s).`);
    } else if (bootstrapCandidates.length > 0) {
      console.log('No bootstrap writes. Re-run with --apply');
    }
  }

  console.log('\n=== Step 3: User-column drift report (profile wins) ===');
  let drifts: UserColumnDriftRow[] = [];
  if (!legacyColumns) {
    console.log('User rating columns already dropped — drift report skipped.');
  } else {
    drifts = await findUserColumnDrifts(limit);
    logUserColumnDrifts(drifts);
  }

  console.log('\n=== Summary ===');
  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        eventPatches: eventResult.patchCount,
        eventProfilesUpdated: eventResult.updated,
        bootstrapCandidates: bootstrapCandidates.length,
        bootstrapCreated: bootstrapped,
        userColumnDrifts: drifts.length,
        nextStep:
          'After operator sign-off: full DB snapshot/PITR, then `npx prisma migrate dev` to drop User rating columns.',
      },
      null,
      2,
    ),
  );
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
