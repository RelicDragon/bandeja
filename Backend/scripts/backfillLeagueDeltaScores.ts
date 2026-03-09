import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';
import { getMatchScoresForDelta } from '../src/services/results/setScoreDelta';
import { LeagueGameResultsService } from '../src/services/league/gameResults.service';

type GameWithRounds = Awaited<
  ReturnType<typeof prisma.game.findFirst<{
    include: {
      outcomes: true;
      rounds: {
        include: {
          matches: {
            include: {
              teams: { include: { players: true } };
              sets: true;
            };
          };
        };
      };
      fixedTeams: { include: { players: true } };
    };
  }>>
>;

function computeCorrectedScores(game: NonNullable<GameWithRounds>): Map<string, { scoresMade: number; scoresLost: number }> {
  const byUser = new Map<string, { scoresMade: number; scoresLost: number }>();

  for (const round of game.rounds) {
    for (const match of round.matches) {
      const validSets = match.sets.filter((s) => s.teamAScore > 0 || s.teamBScore > 0);
      if (validSets.length === 0) continue;

      const { teamAScore, teamBScore } = getMatchScoresForDelta(
        validSets.map((s) => ({ teamAScore: s.teamAScore, teamBScore: s.teamBScore, isTieBreak: s.isTieBreak }))
      );

      const teamA = match.teams.find((t) => t.teamNumber === 1);
      const teamB = match.teams.find((t) => t.teamNumber === 2);
      if (!teamA || !teamB) continue;

      for (const p of teamA.players) {
        const cur = byUser.get(p.userId) ?? { scoresMade: 0, scoresLost: 0 };
        byUser.set(p.userId, {
          scoresMade: cur.scoresMade + teamAScore,
          scoresLost: cur.scoresLost + teamBScore,
        });
      }
      for (const p of teamB.players) {
        const cur = byUser.get(p.userId) ?? { scoresMade: 0, scoresLost: 0 };
        byUser.set(p.userId, {
          scoresMade: cur.scoresMade + teamBScore,
          scoresLost: cur.scoresLost + teamAScore,
        });
      }
    }
  }

  return byUser;
}

const gameInclude = {
  outcomes: true,
  rounds: {
    include: {
      matches: {
        include: {
          teams: { include: { players: true } },
          sets: true,
        },
      },
    },
  },
  fixedTeams: { include: { players: true } },
} as const;

async function backfill(options: { leagueSeasonId?: string; leagueId?: string }) {
  const { leagueSeasonId, leagueId } = options;

  let parentIdFilter: { in: string[] } | undefined;
  if (leagueId) {
    const seasons = await prisma.leagueSeason.findMany({
      where: { leagueId },
      select: { id: true },
    });
    parentIdFilter = { in: seasons.map((s) => s.id) };
  }

  const games = await prisma.game.findMany({
    where: {
      entityType: 'LEAGUE',
      parentId: leagueSeasonId ? leagueSeasonId : parentIdFilter ?? { not: null },
      leagueRoundId: { not: null },
      leagueGroupId: { not: null },
      outcomes: { some: {} },
      rounds: {
        some: {
          matches: {
            some: {
              sets: {
                some: {
                  isTieBreak: true,
                  AND: [{ OR: [{ teamAScore: { gt: 0 } }, { teamBScore: { gt: 0 } }] }],
                },
              },
            },
          },
        },
      },
    },
    include: gameInclude,
    orderBy: { createdAt: 'asc' },
  });

  const toProcess = games.filter((g) => g.parentId && g.leagueRoundId && g.leagueGroupId);
  console.log(`Found ${toProcess.length} league game(s) with TieBreak set(s) to process.`);

  let processed = 0;
  let updated = 0;

  for (const game of toProcess) {
    await prisma.$transaction(async (tx) => {
      await LeagueGameResultsService.unsyncGameResults(game.id, tx);

      const corrected = computeCorrectedScores(game as NonNullable<GameWithRounds>);

      for (const outcome of game.outcomes) {
        const c = corrected.get(outcome.userId);
        if (!c) continue;
        if (c.scoresMade === outcome.scoresMade && c.scoresLost === outcome.scoresLost) continue;

        await tx.gameOutcome.update({
          where: { id: outcome.id },
          data: { scoresMade: c.scoresMade, scoresLost: c.scoresLost },
        });
        updated++;
      }

      await LeagueGameResultsService.syncGameResults(game.id, tx);
    });

    processed++;
    if (processed % 10 === 0 || processed === toProcess.length) {
      console.log(`Progress: ${processed}/${toProcess.length} games.`);
    }
  }

  console.log(`Done. Processed ${processed} games, updated ${updated} outcome row(s) (scoresMade/scoresLost only).`);
}

function parseArgs(): { leagueSeasonId?: string; leagueId?: string } {
  const leagueSeasonId = process.argv.find((a) => a.startsWith('--league-season-id='))?.split('=')[1];
  const leagueId = process.argv.find((a) => a.startsWith('--league-id='))?.split('=')[1];
  return { leagueSeasonId, leagueId };
}

backfill(parseArgs())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
