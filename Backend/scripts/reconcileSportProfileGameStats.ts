import dotenv from 'dotenv';
dotenv.config();

import { Prisma, Sport } from '@prisma/client';
import prisma from '../src/config/database';
import {
  clampSportProfileGameStats,
  resolveSportStatsDeltasForReconcile,
} from '../src/services/results/outcomeStatsSnapshot';

type RecomputedStats = {
  userId: string;
  sport: Sport;
  gamesPlayed: number;
  gamesWon: number;
};

type ProfileRow = {
  userId: string;
  sport: Sport;
  gamesPlayed: number;
  gamesWon: number;
};

async function loadCurrentProfiles(): Promise<ProfileRow[]> {
  return prisma.userSportProfile.findMany({
    select: { userId: true, sport: true, gamesPlayed: true, gamesWon: true },
  });
}

async function recomputeStatsFromOutcomes(): Promise<Map<string, RecomputedStats>> {
  const outcomes = await prisma.gameOutcome.findMany({
    select: {
      userId: true,
      isWinner: true,
      metadata: true,
      game: { select: { sport: true, affectsRating: true } },
    },
  });

  const byKey = new Map<string, RecomputedStats>();

  for (const outcome of outcomes) {
    const deltas = resolveSportStatsDeltasForReconcile(
      outcome.metadata,
      outcome.isWinner,
      outcome.game.affectsRating,
    );
    if (deltas.gamesPlayedDelta === 0 && deltas.gamesWonDelta === 0) continue;

    const key = `${outcome.userId}:${outcome.game.sport}`;
    const current = byKey.get(key) ?? {
      userId: outcome.userId,
      sport: outcome.game.sport,
      gamesPlayed: 0,
      gamesWon: 0,
    };
    current.gamesPlayed += deltas.gamesPlayedDelta;
    current.gamesWon += deltas.gamesWonDelta;
    byKey.set(key, current);
  }

  for (const stats of byKey.values()) {
    const clamped = clampSportProfileGameStats(stats.gamesPlayed, stats.gamesWon);
    stats.gamesPlayed = clamped.gamesPlayed;
    stats.gamesWon = clamped.gamesWon;
  }

  return byKey;
}

function needsRepair(profile: ProfileRow, recomputed: RecomputedStats | undefined): boolean {
  if (profile.gamesWon < 0 || profile.gamesWon > profile.gamesPlayed) return true;
  if (!recomputed) return profile.gamesPlayed > 0 || profile.gamesWon > 0;
  return profile.gamesPlayed !== recomputed.gamesPlayed || profile.gamesWon !== recomputed.gamesWon;
}

async function findNegativeProfiles(limit?: number): Promise<ProfileRow[]> {
  const limitClause = limit != null ? Prisma.sql`LIMIT ${limit}` : Prisma.empty;
  return prisma.$queryRaw<ProfileRow[]>`
    SELECT "userId", sport, "gamesPlayed", "gamesWon"
    FROM "UserSportProfile"
    WHERE "gamesWon" < 0 OR "gamesWon" > "gamesPlayed"
    ORDER BY "gamesWon" ASC
    ${limitClause}
  `;
}

export async function reconcileSportProfileGameStats(options: {
  apply: boolean;
  limit?: number;
}): Promise<{ patchCount: number; updated: number }> {
  const [profiles, recomputedByKey, negativeProfiles] = await Promise.all([
    loadCurrentProfiles(),
    recomputeStatsFromOutcomes(),
    findNegativeProfiles(options.limit),
  ]);

  const negativeKeys = new Set(negativeProfiles.map((p) => `${p.userId}:${p.sport}`));
  const patches = new Map<string, RecomputedStats>();

  for (const profile of profiles) {
    const key = `${profile.userId}:${profile.sport}`;
    const recomputed = recomputedByKey.get(key);
    if (!needsRepair(profile, recomputed)) continue;

    const target = recomputed ?? { userId: profile.userId, sport: profile.sport, gamesPlayed: 0, gamesWon: 0 };
    const clamped = clampSportProfileGameStats(target.gamesPlayed, target.gamesWon);
    patches.set(key, {
      userId: profile.userId,
      sport: profile.sport,
      gamesPlayed: clamped.gamesPlayed,
      gamesWon: clamped.gamesWon,
    });
  }

  for (const key of negativeKeys) {
    if (patches.has(key)) continue;
    const [userId, sportRaw] = key.split(':');
    const sport = sportRaw as Sport;
    const recomputed = recomputedByKey.get(key);
    const clamped = clampSportProfileGameStats(
      recomputed?.gamesPlayed ?? 0,
      recomputed?.gamesWon ?? 0,
    );
    patches.set(key, { userId, sport, ...clamped });
  }

  const patchList = [...patches.values()];
  if (options.limit != null) {
    patchList.splice(options.limit);
  }

  console.log(
    options.apply
      ? `Applying ${patchList.length} sport profile game-stat patch(es)...`
      : `Dry run: ${patchList.length} patch(es) (${negativeProfiles.length} invalid profile row(s)) — pass --apply to write`,
  );

  for (const patch of patchList) {
    const profile = profiles.find((p) => p.userId === patch.userId && p.sport === patch.sport);
    const beforePlayed = profile?.gamesPlayed ?? '?';
    const beforeWon = profile?.gamesWon ?? '?';
    console.log(
      `${patch.userId} | ${patch.sport} | gamesPlayed ${beforePlayed} -> ${patch.gamesPlayed} | gamesWon ${beforeWon} -> ${patch.gamesWon}`,
    );
  }

  if (!options.apply) {
    if (patchList.length > 0) {
      console.log('No changes written. Re-run with --apply');
    }
    return { patchCount: patchList.length, updated: 0 };
  }

  let updated = 0;
  for (const patch of patchList) {
    await prisma.userSportProfile.update({
      where: { userId_sport: { userId: patch.userId, sport: patch.sport } },
      data: {
        gamesPlayed: patch.gamesPlayed,
        gamesWon: patch.gamesWon,
      },
    });
    updated += 1;
  }

  console.log(`Updated ${updated} profile(s).`);
  return { patchCount: patchList.length, updated };
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
  await reconcileSportProfileGameStats({ apply, limit });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
