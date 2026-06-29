import { Prisma, Sport } from '@prisma/client';
import {
  clampSportProfileGameStats,
  resolveSportStatsDeltasForReconcile,
} from '../results/outcomeStatsSnapshot';

type Tx = Prisma.TransactionClient;

export type UserGameStatsOutcome = {
  isWinner: boolean;
  metadata: Prisma.JsonValue | null;
  pointsEarned: number;
  game: {
    sport: Sport;
    affectsRating: boolean;
  };
};

export type RecomputedUserSportStats = {
  sport: Sport;
  gamesPlayed: number;
  gamesWon: number;
};

export function computeUserSportProfileStatsFromOutcomes(
  outcomes: UserGameStatsOutcome[],
): RecomputedUserSportStats[] {
  const bySport = new Map<Sport, RecomputedUserSportStats>();

  for (const outcome of outcomes) {
    const deltas = resolveSportStatsDeltasForReconcile(
      outcome.metadata,
      outcome.isWinner,
      outcome.game.affectsRating,
    );
    if (deltas.gamesPlayedDelta === 0 && deltas.gamesWonDelta === 0) continue;

    const current = bySport.get(outcome.game.sport) ?? {
      sport: outcome.game.sport,
      gamesPlayed: 0,
      gamesWon: 0,
    };
    current.gamesPlayed += deltas.gamesPlayedDelta;
    current.gamesWon += deltas.gamesWonDelta;
    bySport.set(outcome.game.sport, current);
  }

  return [...bySport.values()].map((stats) => ({
    sport: stats.sport,
    ...clampSportProfileGameStats(stats.gamesPlayed, stats.gamesWon),
  }));
}

export async function recomputeUserGameStats(tx: Tx, userId: string): Promise<void> {
  const points = await tx.gameOutcome.aggregate({
    where: { userId },
    _sum: { pointsEarned: true },
  });
  const outcomes = await tx.gameOutcome.findMany({
    where: { userId },
    select: {
      isWinner: true,
      metadata: true,
      pointsEarned: true,
      game: { select: { sport: true, affectsRating: true } },
    },
  });
  const profiles = await tx.userSportProfile.findMany({
    where: { userId },
    select: { id: true, sport: true },
  });

  await tx.user.update({
    where: { id: userId },
    data: {
      totalPoints: points._sum.pointsEarned ?? 0,
    },
  });

  const statsBySport = new Map(
    computeUserSportProfileStatsFromOutcomes(outcomes).map((stats) => [stats.sport, stats]),
  );
  const touchedSports = new Set<Sport>();

  for (const profile of profiles) {
    const stats = statsBySport.get(profile.sport);
    touchedSports.add(profile.sport);
    await tx.userSportProfile.update({
      where: { id: profile.id },
      data: {
        gamesPlayed: stats?.gamesPlayed ?? 0,
        gamesWon: stats?.gamesWon ?? 0,
      },
    });
  }

  for (const stats of statsBySport.values()) {
    if (touchedSports.has(stats.sport)) continue;
    await tx.userSportProfile.create({
      data: {
        userId,
        sport: stats.sport,
        gamesPlayed: stats.gamesPlayed,
        gamesWon: stats.gamesWon,
      },
    });
  }
}
