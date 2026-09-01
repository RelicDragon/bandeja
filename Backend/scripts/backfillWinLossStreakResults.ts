/**
 * Backfill GameOutcome.isWinForStreak without changing the official isWinner.
 *
 *   npm run backfill:win-loss-streak-results
 *   npm run backfill:win-loss-streak-results -- --apply
 */
import dotenv from 'dotenv';
dotenv.config();

import { WinnerOfGame } from '@prisma/client';
import prisma from '../src/config/database';
import {
  computeIsWinForStreak,
  findLeaderboardLastPlace,
} from '../src/services/results/winLossStreakResult';

const BATCH_SIZE = 500;

type PlanRow = {
  id: string;
  next: boolean;
};

async function run(apply: boolean): Promise<void> {
  const outcomes = await prisma.gameOutcome.findMany({
    orderBy: [{ gameId: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      gameId: true,
      isWinForStreak: true,
      wins: true,
      losses: true,
      scoresMade: true,
      scoresLost: true,
      position: true,
      game: { select: { winnerOfGame: true } },
    },
  });

  const outcomesByGameId = new Map<string, typeof outcomes>();
  for (const outcome of outcomes) {
    const rows = outcomesByGameId.get(outcome.gameId) ?? [];
    rows.push(outcome);
    outcomesByGameId.set(outcome.gameId, rows);
  }

  const plans: PlanRow[] = [];
  const unresolved: string[] = [];
  const modeCounts = new Map<WinnerOfGame, number>();
  for (const [gameId, gameOutcomes] of outcomesByGameId) {
    const leaderboardLastPlace = findLeaderboardLastPlace(gameOutcomes);
    for (const outcome of gameOutcomes) {
      const mode = outcome.game.winnerOfGame;
      modeCounts.set(mode, (modeCounts.get(mode) ?? 0) + 1);
      const next = computeIsWinForStreak({
        winnerOfGame: mode,
        wins: outcome.wins,
        losses: outcome.losses,
        scoresMade: outcome.scoresMade,
        scoresLost: outcome.scoresLost,
        position: outcome.position,
        leaderboardLastPlace,
      });
      if (next == null) {
        unresolved.push(`${gameId}:${outcome.id}`);
        continue;
      }
      if (outcome.isWinForStreak !== next) {
        plans.push({ id: outcome.id, next });
      }
    }
  }

  const wins = plans.filter((row) => row.next).length;
  const losses = plans.length - wins;
  console.log(`Outcomes: ${outcomes.length}; games: ${outcomesByGameId.size}`);
  console.log(
    `Modes: ${[...modeCounts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mode, count]) => `${mode}=${count}`)
      .join(', ')}`,
  );
  console.log(`Changes: ${plans.length} (win=${wins}, loss=${losses}); unresolved=${unresolved.length}`);

  if (unresolved.length > 0) {
    console.log(`Unresolved sample: ${unresolved.slice(0, 10).join(', ')}`);
    throw new Error('Backfill has unresolved outcomes; no changes were written');
  }
  if (!apply) {
    console.log('Dry run complete; pass --apply to write.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < plans.length; i += BATCH_SIZE) {
      const batch = plans.slice(i, i + BATCH_SIZE);
      for (const next of [true, false]) {
        const ids = batch.filter((row) => row.next === next).map((row) => row.id);
        if (ids.length === 0) continue;
        await tx.gameOutcome.updateMany({
          where: { id: { in: ids } },
          data: { isWinForStreak: next },
        });
      }
    }
  });

  const remaining = await prisma.gameOutcome.count({ where: { isWinForStreak: null } });
  if (remaining !== 0) {
    throw new Error(`Backfill verification failed: ${remaining} outcome(s) remain null`);
  }
  console.log(`Applied ${plans.length} change(s); verification passed (null=0).`);
}

const apply = process.argv.includes('--apply');
run(apply)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
