import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { calculateGameStatus } from '../../utils/gameStatus';
import { getUserTimezoneFromCityId } from '../user-timezone.service';
import { getRoundResults } from '../results.service';
import { RoundGenerator } from './generation/roundGenerator';
import type { GenMatch } from './generation/types';
import { prismaGameToGenGame, prismaRoundsToGenRounds } from './mapPrismaForGeneration';
import {
  gameIncludeForRoundGeneration,
  type GameForRoundGeneration,
} from './roundGenerationGameInclude';

async function loadGameForRoundGeneration(
  tx: Prisma.TransactionClient,
  gameId: string
): Promise<GameForRoundGeneration> {
  const g = await tx.game.findUnique({
    where: { id: gameId },
    include: gameIncludeForRoundGeneration,
  });
  if (!g) {
    throw new ApiError(404, 'Game not found');
  }
  return g;
}

function assertMatchGenerationSupported(matchGenerationType: string | null | undefined): void {
  if (!matchGenerationType || matchGenerationType === 'HANDMADE' || matchGenerationType === 'AUTOMATIC') {
    return;
  }
  const supported = new Set([
    'FIXED',
    'RANDOM',
    'RATING',
    'WINNERS_COURT',
    'ESCALERA',
  ]);
  if (matchGenerationType === 'ROUND_ROBIN') {
    throw new ApiError(400, 'Round generation type ROUND_ROBIN is not supported');
  }
  if (!supported.has(matchGenerationType)) {
    throw new ApiError(400, `Unsupported match generation type: ${matchGenerationType}`);
  }
}

function validateGeneratedMatches(matches: GenMatch[]): void {
  if (matches.length === 0) {
    throw new ApiError(400, 'Could not generate matches for this game configuration');
  }
}

async function persistGeneratedMatches(
  tx: Prisma.TransactionClient,
  gameId: string,
  roundNumber: number,
  matches: Array<{
    teamA: string[];
    teamB: string[];
    sets: Array<{ teamA: number; teamB: number; isTieBreak?: boolean }>;
    courtId?: string;
  }>
) {
  const round = await tx.round.create({
    data: {
      gameId,
      roundNumber,
      matches: {
        create: matches.map((matchData, matchIndex) => ({
          matchNumber: matchIndex + 1,
          courtId: matchData.courtId ?? null,
          teams: {
            create: [
              {
                teamNumber: 1,
                players: {
                  create: (matchData.teamA ?? []).map((userId) => ({ userId })),
                },
              },
              {
                teamNumber: 2,
                players: {
                  create: (matchData.teamB ?? []).map((userId) => ({ userId })),
                },
              },
            ],
          },
          sets: {
            create: (matchData.sets ?? []).map((setData, setIndex) => ({
              setNumber: setIndex + 1,
              teamAScore: setData.teamA ?? 0,
              teamBScore: setData.teamB ?? 0,
              isTieBreak: setData.isTieBreak ?? false,
            })),
          },
        })),
      },
    },
    select: { id: true },
  });

  return round.id;
}

async function touchGameInProgress(tx: Prisma.TransactionClient, gameId: string) {
  const gameRow = await tx.game.findUnique({
    where: { id: gameId },
    select: { startTime: true, endTime: true, cityId: true, timeIsSet: true, entityType: true },
  });
  if (!gameRow) {
    throw new ApiError(404, 'Game not found');
  }
  const cityTimezone = await getUserTimezoneFromCityId(gameRow.cityId);
  await tx.game.update({
    where: { id: gameId },
    data: {
      resultsStatus: 'IN_PROGRESS',
      finishedDate: null,
      status: calculateGameStatus(
        {
          startTime: gameRow.startTime,
          endTime: gameRow.endTime,
          resultsStatus: 'IN_PROGRESS',
          timeIsSet: gameRow.timeIsSet,
          entityType: gameRow.entityType,
          finishedDate: null,
        },
        cityTimezone
      ),
    },
  });
}

const transactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  timeout: 25_000,
} as const;

async function withRoundGenTransaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(run, transactionOptions);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ApiError(409, 'Could not create round due to a conflict. Please retry.');
    }
    throw e;
  }
}

export type StartResultsEntryResult = {
  roundId: string | null;
  alreadyHadRounds: boolean;
};

export async function generateAndCreateRound(gameId: string): Promise<{ roundId: string }> {
  let createdRoundId: string;

  await withRoundGenTransaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "Game" WHERE id = ${gameId} FOR UPDATE`);

    const gameRow = await tx.game.findUnique({
      where: { id: gameId },
      select: { resultsStatus: true },
    });
    if (!gameRow) {
      throw new ApiError(404, 'Game not found');
    }
    if (gameRow.resultsStatus === 'FINAL') {
      throw new ApiError(400, 'Cannot add rounds to a finalized game');
    }
    if (gameRow.resultsStatus === 'NONE') {
      throw new ApiError(400, 'Start results entry before generating rounds');
    }

    const fullGame = await loadGameForRoundGeneration(tx, gameId);
    const genGame = prismaGameToGenGame(fullGame);
    const genRounds = prismaRoundsToGenRounds(fullGame);

    assertMatchGenerationSupported(genGame.matchGenerationType);

    const roundNumber = genRounds.length + 1;
    const generator = new RoundGenerator({
      rounds: genRounds,
      game: genGame,
      roundNumber,
      fixedNumberOfSets: genGame.fixedNumberOfSets,
    });

    const matches = await generator.generateRound();
    validateGeneratedMatches(matches);

    createdRoundId = await persistGeneratedMatches(tx, gameId, roundNumber, matches);
    await touchGameInProgress(tx, gameId);
  });

  return { roundId: createdRoundId! };
}

export async function startResultsEntryWithGeneratedRound(gameId: string): Promise<StartResultsEntryResult> {
  let roundId: string | null = null;
  let alreadyHadRounds = false;

  await withRoundGenTransaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "Game" WHERE id = ${gameId} FOR UPDATE`);

    const gameRow = await tx.game.findUnique({
      where: { id: gameId },
      select: {
        resultsStatus: true,
        startTime: true,
        endTime: true,
        cityId: true,
        timeIsSet: true,
        entityType: true,
      },
    });
    if (!gameRow) {
      throw new ApiError(404, 'Game not found');
    }
    if (gameRow.resultsStatus === 'FINAL') {
      throw new ApiError(400, 'Cannot start results entry on a finalized game');
    }

    const existingCount = await tx.round.count({ where: { gameId } });
    alreadyHadRounds = existingCount > 0;

    if (alreadyHadRounds) {
      return;
    }

    await touchGameInProgress(tx, gameId);

    const fullGame = await loadGameForRoundGeneration(tx, gameId);
    const genGame = prismaGameToGenGame(fullGame);
    const genRounds = prismaRoundsToGenRounds(fullGame);

    assertMatchGenerationSupported(genGame.matchGenerationType);

    const generator = new RoundGenerator({
      rounds: genRounds,
      game: genGame,
      roundNumber: 1,
      fixedNumberOfSets: genGame.fixedNumberOfSets,
    });

    const matches = await generator.generateRound();
    validateGeneratedMatches(matches);

    roundId = await persistGeneratedMatches(tx, gameId, 1, matches);
  });

  return { roundId, alreadyHadRounds };
}

export async function fetchRoundApiPayload(roundId: string) {
  return getRoundResults(roundId);
}
