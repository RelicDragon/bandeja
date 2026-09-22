import prisma from '../config/database';
import { Sport, Prisma } from '@prisma/client';
import { lockGameResults, matchResultsVersion, withResultsVersions, assertResultsVersion } from './results/resultsConcurrency';
import { cancelAllMatchTimersForGame } from './results/matchTimer.service';
import { matchTimerCoordinator } from './results/matchTimerCoordinator';
import { ApiError } from '../utils/ApiError';
import {
  projectGameUsersForSportContext,
  projectMatchUsersForSportContext,
  projectRoundUsersForSportContext,
} from './game/read.service';
import { getUserTimezoneFromCityId } from './user-timezone.service';
import { calculateGameStatus, calculatePersistableGameStatus } from '../utils/gameStatus';
import { parseMatchSetRole } from './results/matchSetRole';
import { assertMatchNormalizedSetsValid, type NormalizedMatchSetRow } from './results/matchSetsValidation';
import { getGameResultsSelect, RESULTS_USER_SELECT } from './results/gameResults.projection';
import { assertCanReadGameResults } from './results/gameResultsAccess';
import {
  stripLiveScoringFromMatchMetadata,
  readNormalizedSetsFromLiveMetadata,
  normalizedMatchSetRowsEqual,
  readMatchLiveScoringEnvelope,
  shallowMergeMatchMetadata,
  isNonRallyOutcomeClosingLiveScoring,
} from './results/matchLiveScoring.service';
import { appendMatchLiveScoringAudit } from './results/matchLiveScoringAudit.service';
import { updateMatchWinners } from './results/matchWinner.service';
import { undoGameOutcomes } from './results/outcomes.service';
import {
  collectPairRefreshTargets,
  refreshPairStatsForGame,
} from './pairStat/pairStat.service';
import { revertForGame } from './levelChange';
import { syncPodiumAfterLeavingFinal } from './achievements/podiumGrant.service';
import { invalidateAchievementStatsForGame } from './achievements/achievementStats.service';
import { notifyFollowersGameWentLiveInBackground } from './live/liveGameNotify.service';

const SUPPLEMENTAL_SET_SCORE_MAX = 9999;

/**
 * The results payload.
 *
 * Authorization lives in `results/gameResultsAccess.ts` and is applied by the
 * controller before this runs — a private game must never reach a stranger.
 * The projection is an explicit whitelist `select` (not `include`, which loads
 * every `Game` scalar, `Game.paymentHint` included) — see
 * `results/gameResults.projection.ts`.
 */
export async function getGameResults(gameId: string) {
  const game = await prisma.$transaction(tx => tx.game.findUnique({
    where: { id: gameId }, select: getGameResultsSelect(),
  }), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  return projectGameUsersForSportContext(withResultsVersions(game) as { sport?: Sport } & Record<string, unknown>);
}

/**
 * A round of a game. Same projection rules as {@link getGameResults}: a round id
 * is handed out inside the results payload, so this endpoint must not be a way
 * around the player whitelist.
 */
export async function getRoundResults(roundId: string, viewerUserId?: string | null) {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      game: { select: { id: true, sport: true } },
      matches: {
        include: {
          teams: {
            include: {
              players: {
                include: {
                  user: {
                    select: RESULTS_USER_SELECT,
                  },
                },
              },
            },
          },
          sets: {
            orderBy: { setNumber: 'asc' },
          },
        },
        orderBy: { matchNumber: 'asc' },
      },
      outcomes: {
        include: {
          user: {
            select: RESULTS_USER_SELECT,
          },
        },
      },
    },
  });

  if (!round) {
    throw new ApiError(404, 'Round not found');
  }
  await assertCanReadGameResults(round.game.id, viewerUserId ?? null);

  const sport = round.game?.sport ?? Sport.PADEL;
  const { game: _game, ...roundData } = round;
  void _game;
  return projectRoundUsersForSportContext({ ...roundData, matches: roundData.matches.map(m => ({ ...m, resultsVersion: matchResultsVersion(m) })) }, sport);
}

/** One match. Authorized against the owning game, like {@link getRoundResults}. */
export async function getMatchResults(matchId: string, viewerUserId?: string | null) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      round: {
        select: {
          game: { select: { id: true, sport: true } },
        },
      },
      teams: {
        include: {
          players: {
            include: {
              user: {
                select: RESULTS_USER_SELECT,
              },
            },
          },
        },
      },
      sets: {
        orderBy: { setNumber: 'asc' },
      },
    },
  });

  if (!match) {
    throw new ApiError(404, 'Match not found');
  }
  await assertCanReadGameResults(match.round.game.id, viewerUserId ?? null);

  const sport = match.round?.game?.sport ?? Sport.PADEL;
  const { round: _round, ...matchData } = match;
  void _round;
  return projectMatchUsersForSportContext({ ...matchData, resultsVersion: matchResultsVersion(matchData) }, sport);
}

export async function deleteGameResults(gameId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      participants: true,
      outcomes: true,
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const { assertGameNotLockedTechnicalWithdrawal } = await import(
    './league/leagueTechnicalWithdrawalGuard'
  );
  await assertGameNotLockedTechnicalWithdrawal(gameId, prisma);

  // PRD 352 — capture the pairs *before* the transaction: it deletes
  // `Team` / `TeamPlayer`, after which the generated-format sides are gone.
  const pairRefreshTargets = await collectPairRefreshTargets(gameId);

  await prisma.$transaction(async (tx) => {
    await lockGameResults(tx, gameId);
    if (game.outcomes.length > 0) {
      await undoGameOutcomes(gameId, tx);
    } else {
      await revertForGame(gameId, 'all', tx);
    }

    await tx.round.deleteMany({
      where: { gameId },
    });

    const updatedGame = await tx.game.findUnique({
      where: { id: gameId },
      select: {
        startTime: true,
        endTime: true,
        cityId: true,
        timeIsSet: true,
        entityType: true,
        status: true,
      },
    });
    
    if (updatedGame) {
      const cityTimezone = await getUserTimezoneFromCityId(updatedGame.cityId);
      
      await tx.game.update({
        where: { id: gameId },
        data: {
          resultsStatus: 'NONE',
          finishedDate: null,
          metadata: {
            ...((game.metadata as any) || {}),
          },
          status: calculatePersistableGameStatus({
            startTime: updatedGame.startTime,
            endTime: updatedGame.endTime,
            resultsStatus: 'NONE',
            timeIsSet: updatedGame.timeIsSet,
            entityType: updatedGame.entityType,
          }, cityTimezone, updatedGame.status),
        },
      });
    }
    await tx.playerLevelEvaluation.deleteMany({ where: { gameId } });
    await syncPodiumAfterLeavingFinal({ gameId, tx });
    await invalidateAchievementStatsForGame({ gameId, tx });
  });
  await refreshPairStatsForGame(gameId, pairRefreshTargets);
}

export async function resetGameResults(gameId: string) {
  const { assertGameNotLockedTechnicalWithdrawal } = await import(
    './league/leagueTechnicalWithdrawalGuard'
  );
  await assertGameNotLockedTechnicalWithdrawal(gameId, prisma);

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      participants: true,
      outcomes: true,
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  // PRD 352 — capture the pairs *before* the transaction: it deletes
  // `Team` / `TeamPlayer`, after which the generated-format sides are gone.
  const pairRefreshTargets = await collectPairRefreshTargets(gameId);

  await prisma.$transaction(async (tx) => {
    await lockGameResults(tx, gameId);
    if (game.outcomes.length > 0) {
      await undoGameOutcomes(gameId, tx);
    } else {
      await revertForGame(gameId, 'all', tx);
    }

    await tx.roundOutcome.deleteMany({
      where: {
        round: {
          gameId,
        },
      },
    });

    await tx.set.deleteMany({
      where: {
        match: {
          round: {
            gameId,
          },
        },
      },
    });
    
    await tx.teamPlayer.deleteMany({
      where: {
        team: {
          match: {
            round: {
              gameId,
            },
          },
        },
      },
    });
    
    await tx.team.deleteMany({
      where: {
        match: {
          round: {
            gameId,
          },
        },
      },
    });
    
    await tx.match.deleteMany({
      where: {
        round: {
          gameId,
        },
      },
    });

    await tx.round.deleteMany({
      where: { gameId },
    });

    const updatedGame = await tx.game.findUnique({
      where: { id: gameId },
      select: {
        startTime: true,
        endTime: true,
        cityId: true,
        timeIsSet: true,
        entityType: true,
        status: true,
      },
    });
    
    if (updatedGame) {
      const cityTimezone = await getUserTimezoneFromCityId(updatedGame.cityId);
      
      await tx.game.update({
        where: { id: gameId },
        data: {
          resultsStatus: 'NONE',
          finishedDate: null,
          metadata: {
            ...((game.metadata as any) || {}),
          },
          status: calculatePersistableGameStatus({
            startTime: updatedGame.startTime,
            endTime: updatedGame.endTime,
            resultsStatus: 'NONE',
            timeIsSet: updatedGame.timeIsSet,
            entityType: updatedGame.entityType,
          }, cityTimezone, updatedGame.status),
        },
      });
    }
    await tx.playerLevelEvaluation.deleteMany({ where: { gameId } });
    await syncPodiumAfterLeavingFinal({ gameId, tx });
    await invalidateAchievementStatsForGame({ gameId, tx });
  });
  await refreshPairStatsForGame(gameId, pairRefreshTargets);
}

export async function editGameResults(gameId: string) {
  const { assertGameNotLockedTechnicalWithdrawal } = await import(
    './league/leagueTechnicalWithdrawalGuard'
  );
  await assertGameNotLockedTechnicalWithdrawal(gameId, prisma);

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      participants: true,
      outcomes: true,
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  if (game.resultsStatus !== 'FINAL') {
    throw new ApiError(400, 'Can only edit results with FINAL status');
  }

  // PRD 352 — capture the pairs *before* the transaction: it deletes
  // `Team` / `TeamPlayer`, after which the generated-format sides are gone.
  const pairRefreshTargets = await collectPairRefreshTargets(gameId);

  await prisma.$transaction(async (tx) => {
    await lockGameResults(tx, gameId);
    if (game.outcomes.length > 0) {
      await undoGameOutcomes(gameId, tx);
    } else {
      await revertForGame(gameId, 'all', tx);
    }

    await tx.roundOutcome.deleteMany({
      where: {
        round: {
          gameId,
        },
      },
    });

      const updatedGame = await tx.game.findUnique({
        where: { id: gameId },
        select: { startTime: true, endTime: true, cityId: true, timeIsSet: true, entityType: true },
      });
      
      if (updatedGame) {
        const cityTimezone = await getUserTimezoneFromCityId(updatedGame.cityId);
        
        await tx.game.update({
          where: { id: gameId },
          data: {
            resultsStatus: 'IN_PROGRESS',
            finishedDate: null,
            status: calculateGameStatus({
              startTime: updatedGame.startTime,
              endTime: updatedGame.endTime,
              resultsStatus: 'IN_PROGRESS',
              timeIsSet: updatedGame.timeIsSet,
              entityType: updatedGame.entityType,
            }, cityTimezone),
          },
        });
        await updateMatchWinners(gameId, tx);
        // X1: undo already rebuilt season standings; sync podium for event / parent season.
        await syncPodiumAfterLeavingFinal({ gameId, tx });
        await invalidateAchievementStatsForGame({ gameId, tx });
      }
  });
  await refreshPairStatsForGame(gameId, pairRefreshTargets);
}

export async function syncResults(gameId: string, rounds: any[], baseVersion?: string) {
  if (!Array.isArray(rounds)) throw new ApiError(400, 'rounds must be an array');
  return prisma.$transaction(async tx => {
    await lockGameResults(tx, gameId);
    const { assertGameNotLockedTechnicalWithdrawal } = await import('./league/leagueTechnicalWithdrawalGuard');
    await assertGameNotLockedTechnicalWithdrawal(gameId, tx);
    const game = await tx.game.findUnique({ where: { id: gameId }, select: getGameResultsSelect() });
    if (!game) throw new ApiError(404, 'Game not found');
    assertResultsVersion(baseVersion, withResultsVersions(game).resultsVersion);
    if (game.resultsStatus === 'FINAL') throw new ApiError(409, 'Results are finalized. Reopen results before scoring.');
    const roundIds = new Set<string>();
    const matchIds = new Set<string>();
    for (const round of rounds) {
      if (!round || typeof round.id !== 'string' || roundIds.has(round.id) || !Array.isArray(round.matches)) {
        throw new ApiError(400, 'Invalid or duplicate round');
      }
      roundIds.add(round.id);
      for (const match of round.matches) {
        if (!match || typeof match.id !== 'string' || matchIds.has(match.id) || !Array.isArray(match.sets)
          || !Array.isArray(match.teamA) || !Array.isArray(match.teamB)) throw new ApiError(400, 'Invalid or duplicate match');
        matchIds.add(match.id);
      }
    }
    // Apply the accepted snapshot in place. Recreating every row used to erase live
    // revisions, timers, fixed-team metadata, active-match pointers and audit history.
    await tx.match.deleteMany({ where: { round: { gameId }, id: { notIn: [...matchIds] } } });
    await tx.round.deleteMany({ where: { gameId, id: { notIn: [...roundIds] } } });
    for (const [roundIndex, round] of rounds.entries()) {
      const existingRound = await tx.round.findUnique({ where: { id: round.id } });
      if (existingRound && existingRound.gameId !== gameId) throw new ApiError(400, 'Round belongs to another game');
      await tx.round.upsert({ where: { id: round.id }, create: { id: round.id, gameId, roundNumber: roundIndex + 1 }, update: { roundNumber: roundIndex + 1 } });
      for (const [matchIndex, input] of round.matches.entries()) {
        let match = await tx.match.findUnique({ where: { id: input.id }, include: { sets: { orderBy: { setNumber: 'asc' } }, teams: { orderBy: { teamNumber: 'asc' }, include: { players: { orderBy: { createdAt: 'asc' } } } } } });
        if (match && match.roundId !== round.id) throw new ApiError(400, 'Match belongs to another round');
        if (!match) {
          match = await tx.match.create({ data: { id: input.id, roundId: round.id, matchNumber: matchIndex + 1, teams: { create: [{ teamNumber: 1 }, { teamNumber: 2 }] } }, include: { sets: true, teams: { include: { players: true } } } });
        }
        const unchanged = JSON.stringify(match.teams.find(t => t.teamNumber === 1)?.players.map(p => p.userId) ?? []) === JSON.stringify(input.teamA)
          && JSON.stringify(match.teams.find(t => t.teamNumber === 2)?.players.map(p => p.userId) ?? []) === JSON.stringify(input.teamB)
          && (match.courtId ?? null) === (input.courtId || null)
          && JSON.stringify(match.sets.map(s => [s.teamAScore, s.teamBScore, s.isTieBreak, s.role])) === JSON.stringify(input.sets.map((s: any) => [s.teamA, s.teamB, !!s.isTieBreak, parseMatchSetRole(s.role)]));
        const storedMetadata = (match.metadata ?? {}) as Record<string, unknown>;
        const metadataChanged = Object.entries(input.metadata ?? {}).some(([key, value]) => key !== 'liveScoring' && JSON.stringify(storedMetadata[key]) !== JSON.stringify(value));
        if (!unchanged || metadataChanged) {
          await updateMatch(gameId, match.id, { ...input, baseVersion: matchResultsVersion(match) }, undefined, tx);
        }
        if (match.matchNumber !== matchIndex + 1) await tx.match.update({ where: { id: match.id }, data: { matchNumber: matchIndex + 1 } });
      }
    }
    const saved = await tx.game.findUniqueOrThrow({ where: { id: gameId }, select: getGameResultsSelect() });
    return withResultsVersions(saved);
  }, { timeout: 25000 });
}

export async function createRound(gameId: string, roundId: string) {
  await prisma.$transaction(async tx => {
    await lockGameResults(tx, gameId);
    const lifecycle = await tx.game.findUnique({ where: { id: gameId }, select: { resultsStatus: true } });
    if (lifecycle?.resultsStatus === 'FINAL') throw new ApiError(409, 'Results are finalized. Reopen results before editing.');
  const { assertGameNotLockedTechnicalWithdrawal } = await import(
    './league/leagueTechnicalWithdrawalGuard'
  );
  await assertGameNotLockedTechnicalWithdrawal(gameId, tx);

  const roundCount = await tx.round.count({ where: { gameId } });

  await tx.round.create({
    data: {
      id: roundId,
      gameId,
      roundNumber: roundCount + 1,
    },
  });

  const gameRow = await tx.game.findUnique({
    where: { id: gameId },
    select: {
      startTime: true,
      endTime: true,
      cityId: true,
      timeIsSet: true,
      entityType: true,
      resultsStatus: true,
      outcomes: { select: { id: true } },
    },
  });
  if (!gameRow) {
    throw new ApiError(404, 'Game not found');
  }
  const cityTimezone = await getUserTimezoneFromCityId(gameRow.cityId);
  {
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

  }, { timeout: 25000 });
  notifyFollowersGameWentLiveInBackground(gameId);
}

export async function deleteRound(gameId: string, roundId: string) {
  await prisma.$transaction(async tx => {
    await lockGameResults(tx, gameId);
    const lifecycle = await tx.game.findUnique({ where: { id: gameId }, select: { resultsStatus: true } });
    if (lifecycle?.resultsStatus === 'FINAL') throw new ApiError(409, 'Results are finalized. Reopen results before editing.');
  const { assertGameNotLockedTechnicalWithdrawal } = await import(
    './league/leagueTechnicalWithdrawalGuard'
  );
  await assertGameNotLockedTechnicalWithdrawal(gameId, tx);

  const round = await tx.round.findUnique({
    where: { id: roundId },
  });

  if (!round) {
    throw new ApiError(404, 'Round not found');
  }

  if (round.gameId !== gameId) {
    throw new ApiError(403, 'Round does not belong to this game');
  }

  {
    const deletedRoundNumber = round.roundNumber;
    await tx.round.delete({ where: { id: roundId } });

    const roundsToUpdate = await tx.round.findMany({
      where: {
        gameId,
        roundNumber: { gt: deletedRoundNumber },
      },
      select: { id: true },
    });

    for (const roundToUpdate of roundsToUpdate) {
      await tx.round.update({
        where: { id: roundToUpdate.id },
        data: {
          roundNumber: { decrement: 1 },
        },
      });
    }
  }
  }, { timeout: 25000 });
}

export async function createMatch(gameId: string, roundId: string, matchId: string) {
  await prisma.$transaction(async tx => {
    await lockGameResults(tx, gameId);
    const lifecycle = await tx.game.findUnique({ where: { id: gameId }, select: { resultsStatus: true } });
    if (lifecycle?.resultsStatus === 'FINAL') throw new ApiError(409, 'Results are finalized. Reopen results before editing.');
  const { assertGameNotLockedTechnicalWithdrawal } = await import(
    './league/leagueTechnicalWithdrawalGuard'
  );
  await assertGameNotLockedTechnicalWithdrawal(gameId, tx);

  const round = await tx.round.findUnique({
    where: { id: roundId },
  });

  if (!round) {
    throw new ApiError(404, 'Round not found');
  }

  if (round.gameId !== gameId) {
    throw new ApiError(403, 'Round does not belong to this game');
  }

  const matchCount = await tx.match.count({ where: { roundId } });

  {
    const match = await tx.match.create({
      data: {
        id: matchId,
        roundId: round.id,
        matchNumber: matchCount + 1,
      },
    });

    await tx.team.create({
      data: {
        matchId: match.id,
        teamNumber: 1,
      },
    });

    await tx.team.create({
      data: {
        matchId: match.id,
        teamNumber: 2,
      },
    });
  }
  }, { timeout: 25000 });
}

export async function deleteMatch(gameId: string, matchId: string) {
  await prisma.$transaction(async tx => {
    await lockGameResults(tx, gameId);
    const lifecycle = await tx.game.findUnique({ where: { id: gameId }, select: { resultsStatus: true } });
    if (lifecycle?.resultsStatus === 'FINAL') throw new ApiError(409, 'Results are finalized. Reopen results before editing.');
  const { assertGameNotLockedTechnicalWithdrawal } = await import(
    './league/leagueTechnicalWithdrawalGuard'
  );
  await assertGameNotLockedTechnicalWithdrawal(gameId, tx);

  const match = await tx.match.findUnique({
    where: { id: matchId },
    include: { round: { select: { gameId: true } } },
  });

  if (!match) {
    throw new ApiError(404, 'Match not found');
  }

  if (match.round.gameId !== gameId) {
    throw new ApiError(403, 'Match does not belong to this game');
  }

  matchTimerCoordinator.cancel(matchId);

  {
    const deletedMatchNumber = match.matchNumber;
    await tx.match.delete({ where: { id: matchId } });

    const matchesToUpdate = await tx.match.findMany({
      where: {
        roundId: match.roundId,
        matchNumber: { gt: deletedMatchNumber },
      },
      select: { id: true },
    });

    for (const matchToUpdate of matchesToUpdate) {
      await tx.match.update({
        where: { id: matchToUpdate.id },
        data: {
          matchNumber: { decrement: 1 },
        },
      });
    }
  }
  }, { timeout: 25000 });
}

function orderedTeamUserIds(team: { players: { userId: string }[] } | undefined): string[] {
  if (!team?.players?.length) return [];
  return team.players.map((p) => p.userId);
}

export async function updateMatch(
  gameId: string,
  matchId: string,
  matchData: {
    teamA: string[];
    teamB: string[];
    sets: Array<{ teamA: number; teamB: number; isTieBreak?: boolean; role?: string }>;
    courtId?: string;
    /** Shallow-merged into `match.metadata`. Setting `nonRallyOutcome` to WO/default/retired strips `liveScoring`. */
    metadata?: Record<string, unknown>;
    baseVersion?: string;
  },
  options?: { userId?: string | null },
  transaction?: Prisma.TransactionClient
): Promise<{ liveScoringCleared: boolean; resultsVersion: string }> {

  if (!transaction) {
    return prisma.$transaction(tx => updateMatch(gameId, matchId, matchData, options, tx), { timeout: 25000 });
  }
  const tx = transaction;
  await lockGameResults(tx, gameId);
  const match = await tx.match.findUnique({
    where: { id: matchId },
    include: {
      teams: {
        orderBy: { teamNumber: 'asc' },
        include: {
          players: {
            orderBy: { createdAt: 'asc' },
            select: { userId: true },
          },
        },
      },
      sets: {
        orderBy: { setNumber: 'asc' },
      },
      round: {
        select: { gameId: true },
      },
    },
  });

  if (!match) {
    throw new ApiError(404, 'Match not found');
  }

  if (match.round.gameId !== gameId) {
    throw new ApiError(400, 'Match does not belong to the specified game');
  }

  const { assertGameNotLockedTechnicalWithdrawal } = await import(
    './league/leagueTechnicalWithdrawalGuard'
  );
  await assertGameNotLockedTechnicalWithdrawal(gameId, tx);

  const game = await tx.game.findUnique({
    where: { id: gameId },
    select: {
      fixedNumberOfSets: true,
      ballsInGames: true,
      winnerOfMatch: true,
      scoringPreset: true,
      matchTimerEnabled: true,
      startTime: true,
      endTime: true,
      cityId: true,
      timeIsSet: true,
      entityType: true,
      resultsStatus: true,
      outcomes: { select: { id: true } },
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  if (game.resultsStatus === 'FINAL') throw new ApiError(409, 'Results are finalized. Reopen results before scoring.');
  assertResultsVersion(matchData.baseVersion, matchResultsVersion(match));

  const normalizedSets: NormalizedMatchSetRow[] = (matchData.sets || []).map((s) => ({
    teamA: Math.min(SUPPLEMENTAL_SET_SCORE_MAX, Math.max(0, Number(s.teamA) || 0)),
    teamB: Math.min(SUPPLEMENTAL_SET_SCORE_MAX, Math.max(0, Number(s.teamB) || 0)),
    isTieBreak: Boolean(s.isTieBreak),
    role: parseMatchSetRole((s as { role?: unknown }).role),
  }));

  assertMatchNormalizedSetsValid(game, normalizedSets);

  const teamAEntity = match.teams.find((t) => t.teamNumber === 1);
  const teamBEntity = match.teams.find((t) => t.teamNumber === 2);
  const prevTeamAIds = orderedTeamUserIds(teamAEntity);
  const prevTeamBIds = orderedTeamUserIds(teamBEntity);
  const incomingTeamA = matchData.teamA ?? [];
  const incomingTeamB = matchData.teamB ?? [];
  const rostersUnchanged =
    prevTeamAIds.length === incomingTeamA.length &&
    prevTeamBIds.length === incomingTeamB.length &&
    prevTeamAIds.every((id, i) => id === incomingTeamA[i]) &&
    prevTeamBIds.every((id, i) => id === incomingTeamB[i]);

  const liveEnvBefore = readMatchLiveScoringEnvelope(match.metadata);
  const hadLiveEnvelope = liveEnvBefore?.state != null;
  const revBefore = liveEnvBefore?.revision ?? null;
  const liveGrid = readNormalizedSetsFromLiveMetadata(match.metadata);
  const mergedMetadataPreview = shallowMergeMatchMetadata(match.metadata, matchData.metadata);
  const nonRallyBlocksLivePreserve = isNonRallyOutcomeClosingLiveScoring(mergedMetadataPreview);
  const preserveLiveScoring =
    rostersUnchanged &&
    liveGrid != null &&
    normalizedMatchSetRowsEqual(normalizedSets, liveGrid) &&
    !nonRallyBlocksLivePreserve;

  let outMatchMetadata = shallowMergeMatchMetadata(match.metadata, matchData.metadata);
  if (!preserveLiveScoring || isNonRallyOutcomeClosingLiveScoring(outMatchMetadata)) {
    outMatchMetadata = stripLiveScoringFromMatchMetadata(outMatchMetadata);
  }
  const hasLiveAfter = readMatchLiveScoringEnvelope(outMatchMetadata)?.state != null;
  const liveScoringCleared = hadLiveEnvelope && !hasLiveAfter;

  {
    if (matchData.courtId !== undefined) {
      await tx.match.update({
        where: { id: match.id },
        data: {
          courtId: matchData.courtId || null,
        },
      });
    }

    const teamA = match.teams.find(t => t.teamNumber === 1);
    const teamB = match.teams.find(t => t.teamNumber === 2);

    if (teamA) {
      await tx.teamPlayer.deleteMany({ where: { teamId: teamA.id } });
      for (const playerId of matchData.teamA || []) {
        await tx.teamPlayer.create({
          data: {
            teamId: teamA.id,
            userId: playerId,
          },
        });
      }
    }

    if (teamB) {
      await tx.teamPlayer.deleteMany({ where: { teamId: teamB.id } });
      for (const playerId of matchData.teamB || []) {
        await tx.teamPlayer.create({
          data: {
            teamId: teamB.id,
            userId: playerId,
          },
        });
      }
    }

    await tx.set.deleteMany({ where: { matchId: match.id } });
    for (let i = 0; i < normalizedSets.length; i++) {
      const s = normalizedSets[i];
      await tx.set.create({
        data: {
          matchId: match.id,
          setNumber: i + 1,
          teamAScore: s.teamA,
          teamBScore: s.teamB,
          isTieBreak: s.isTieBreak,
          role: s.role,
        },
      });
    }

    await tx.match.update({
      where: { id: match.id },
      data: {
        metadata: outMatchMetadata,
      },
    });

    await updateMatchWinners(gameId, tx);
  }

  const cityTimezone = await getUserTimezoneFromCityId(game.cityId);
  {
    await tx.game.update({
      where: { id: gameId },
      data: {
        resultsStatus: 'IN_PROGRESS',
        finishedDate: null,
        status: calculateGameStatus(
          {
            startTime: game.startTime,
            endTime: game.endTime,
            resultsStatus: 'IN_PROGRESS',
            timeIsSet: game.timeIsSet,
            entityType: game.entityType,
            finishedDate: null,
          },
          cityTimezone
        ),
      },
    });
  }

  if (hadLiveEnvelope) {
    void appendMatchLiveScoringAudit({
      matchId,
      gameId,
      source: liveScoringCleared ? 'SYSTEM_CLEAR' : 'TABLE_PUT',
      userId: options?.userId ?? null,
      revisionBefore: revBefore,
      revisionAfter: preserveLiveScoring ? revBefore : null,
    });
  }

  const saved = await tx.match.findUniqueOrThrow({ where: { id: matchId }, include: { sets: true, teams: { include: { players: true } } } });
  return { liveScoringCleared, resultsVersion: matchResultsVersion(saved) };
}

/** Shallow-merge `patch` into match `metadata`. Walkover/default/retired strips `liveScoring`. */
export async function patchMatchMetadata(
  gameId: string,
  matchId: string,
  patch: Record<string, unknown>,
  options?: { userId?: string | null }
): Promise<{ liveScoringCleared: boolean }> {
  return prisma.$transaction(async tx => {
  await lockGameResults(tx, gameId);
  const { assertGameNotLockedTechnicalWithdrawal } = await import(
    './league/leagueTechnicalWithdrawalGuard'
  );
  await assertGameNotLockedTechnicalWithdrawal(gameId, tx);

  const match = await tx.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      metadata: true,
      round: { select: { gameId: true } },
    },
  });

  if (!match) {
    throw new ApiError(404, 'Match not found');
  }
  if (match.round.gameId !== gameId) {
    throw new ApiError(400, 'Match does not belong to the specified game');
  }

  const liveBefore = readMatchLiveScoringEnvelope(match.metadata);
  const hadLiveEnvelope = liveBefore?.state != null;
  const revBefore = liveBefore?.revision ?? null;

  let outMeta = shallowMergeMatchMetadata(match.metadata, patch);
  if (isNonRallyOutcomeClosingLiveScoring(outMeta)) {
    outMeta = stripLiveScoringFromMatchMetadata(outMeta);
  }

  await tx.match.update({
    where: { id: matchId },
    data: { metadata: outMeta },
  });

  const hasLiveAfter = readMatchLiveScoringEnvelope(outMeta)?.state != null;
  const liveScoringCleared = hadLiveEnvelope && !hasLiveAfter;

  if (hadLiveEnvelope) {
    void appendMatchLiveScoringAudit({
      matchId,
      gameId,
      source: liveScoringCleared ? 'SYSTEM_CLEAR' : 'TABLE_PUT',
      userId: options?.userId ?? null,
      revisionBefore: revBefore,
      revisionAfter: hasLiveAfter ? revBefore : null,
    });
  }

  return { liveScoringCleared };
  }, { timeout: 25000 });
}
