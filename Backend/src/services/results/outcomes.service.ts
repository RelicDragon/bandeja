import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { WinnerOfGame, Prisma, EntityType, ResultsStatus } from '@prisma/client';
import { getMatchScoresForDelta } from './setScoreDelta';
import { calculateByMatchesWonOutcomes, calculateByScoresDeltaOutcomes, calculateByPointsOutcomes } from './calculator.service';
import { applySharedPlacementToOutcomes } from './outcomeComputation';
import { updateMatchWinners } from './matchWinner.service';
import { isPrismaMatchCountedForStandingsAndRating } from './matchStandingsPrisma';
import { getRules } from './liveScoringEngine/rulebook';
import { toRatingSetScores } from '@bandeja/shared/automaticRelaxedScoring';
import { getUserTimezoneFromCityId } from '../user-timezone.service';
import { USER_SELECT_FIELDS, USER_SELECT_WITH_SPORT_PROFILES } from '../../utils/constants';
import { projectGameUsersForSportContext } from '../game/read.service';
import { LeagueGameResultsService } from '../league/gameResults.service';
import { BracketAdvancementService } from '../league/bracketAdvancement.service';
import { BracketGameNotificationService } from '../league/bracketGameNotification.service';
import { LeagueStandingsRecalculateService } from '../league/leagueStandingsRecalculate.service';
import { SocialParticipantLevelService } from '../socialParticipantLevel.service';
import { calculateGameStatus, isResultsBasedEntityType, ARCHIVE_BY_FINISHED_DATE_TYPES } from '../../utils/gameStatus';
import { attemptBetResolutionAfterOutcomesRecalc } from '../bets/betResolution.service';
import resultsSenderService from '../telegram/resultsSender.service';
import { resetMatchTimersInGameTx, cancelAllMatchTimersForGame } from './matchTimer.service';
import { cleanupInviteParticipantsForEndedGame } from '../../utils/gameInviteCleanup';
import {
  isPlacementProtectedFromNegativeRating,
  mergePlacementRatingFloorMetadata,
} from './ratingPlacementFloor';
import {
  clampReliability,
  clampSportLevel,
  computeApplySportStats,
  computeLevelAfter,
  computeSportStatsDeltas,
  computeUndoSportStatsFromDeltas,
  computeUndoTotalPoints,
  mergeRatingStatsAppliedMetadata,
  mergeRatingUncertaintyMetadata,
  mergeSportStatsDeltasMetadata,
  readRatingUncertaintyMetadata,
  resolveRatingStatsAppliedForUndo,
  resolveSportStatsDeltasForUndo,
} from './outcomeStatsSnapshot';
import { createGameEvent, revertForGame } from '../levelChange';
import { isOfficialMatchSetRole } from './matchSetRole';
import {
  ensureSportInEnabled,
  resolveUserSportSnapshot,
} from '../user/userSportProfile.service';
import {
  loadQualifyingPlayAts,
  mergePlayStreakMetadata,
  readPlayStreakAppliedFromMetadata,
  recomputePlayStreakForUserSport,
} from './playStreak.service';
import { recomputePlayStreak } from './playStreak';
import { getUserTimezone } from '../user-timezone.service';
import {
  accrueRatingUncertainty,
  ratingUncertaintyAfterFinishedGame,
} from './ratingUncertainty';
import { countsAsRatingActivity, countsForPlayStreak } from './ratingActivity';

async function rebuildLeagueSeasonStandingsIfNeeded(
  gameId: string,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const row = await tx.game.findUnique({
    where: { id: gameId },
    select: { entityType: true, parentId: true },
  });
  if (row?.entityType === EntityType.LEAGUE && row.parentId) {
    await LeagueStandingsRecalculateService.recalculateFromPlayedGames(row.parentId, tx);
  }
}

export async function generateGameOutcomes(gameId: string, tx?: Prisma.TransactionClient) {
  const prismaClient = tx || prisma;
  const game = await prismaClient.game.findUnique({
    where: { id: gameId },
    include: {
      fixedTeams: {
        include: {
          players: true,
        },
        orderBy: { teamNumber: 'asc' },
      },
      participants: {
        include: {
          user: {
            select: {
              ...USER_SELECT_FIELDS,
              gender: true,
              sportProfiles: {
                select: {
                  sport: true,
                  level: true,
                  reliability: true,
                  ratingUncertainty: true,
                  lastRatingActivityAt: true,
                  gamesPlayed: true,
                  gamesWon: true,
                },
              },
            },
          },
        },
        where: {
          status: 'PLAYING',
        },
      },
      rounds: {
        include: {
          matches: {
            include: {
              teams: {
                include: {
                  players: true,
                },
              },
              sets: { orderBy: { setNumber: 'asc' } },
            },
          },
        },
        orderBy: {
          roundNumber: 'asc',
        },
      },
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const players = game.participants.map((p) => {
    const sportSnapshot = resolveUserSportSnapshot(p.user, game.sport);
    const ratingUncertainty = game.affectsRating
      ? accrueRatingUncertainty(
          sportSnapshot.ratingUncertainty,
          sportSnapshot.lastRatingActivityAt,
        )
      : 0;
    return {
      userId: p.userId,
      level: sportSnapshot.level,
      reliability: sportSnapshot.reliability,
      gamesPlayed: sportSnapshot.gamesPlayed,
      ratingUncertainty,
    };
  });

  const rules = getRules(game);

  const roundResults = game.rounds.map(round => ({
    matches: round.matches
      .map(match => {
        if (!isPrismaMatchCountedForStandingsAndRating(match, game)) return null;

        const validSets = match.sets.filter(
          set => (set.teamAScore > 0 || set.teamBScore > 0) && isOfficialMatchSetRole(set.role)
        );
        if (validSets.length === 0) return null;

        const matchMetadata =
          match.metadata && typeof match.metadata === 'object' && !Array.isArray(match.metadata)
            ? (match.metadata as Record<string, unknown>)
            : undefined;

        const { teamAScore: scoreA, teamBScore: scoreB } = getMatchScoresForDelta(validSets, {
          matchMetadata,
          rules,
        });
        const teams = match.teams.map(team => {
          const totalScore = team.teamNumber === 1 ? scoreA : team.teamNumber === 2 ? scoreB : 0;

          return {
            teamId: team.id,
            teamNumber: team.teamNumber,
            score: totalScore,
            playerIds: team.players.map(p => p.userId),
          };
        });

        const sets = toRatingSetScores(
          validSets.map(set => ({
            teamAScore: set.teamAScore,
            teamBScore: set.teamBScore,
            isTieBreak: set.isTieBreak || false,
          })),
          matchMetadata,
          rules,
        );

        return {
          teams,
          winnerId: match.winnerId,
          sets,
          metadata: matchMetadata,
        };
      })
      .filter((match): match is NonNullable<typeof match> => match !== null),
  }));

  let result;
  const ballsInGames = game.ballsInGames || false;
  const pointsPerWin = game.pointsPerWin || 0;
  const pointsPerTie = game.pointsPerTie || 0;
  const pointsPerLoose = game.pointsPerLoose || 0;
  const placementInput = {
    hasFixedTeams: game.hasFixedTeams,
    genderTeams: game.genderTeams,
    fixedTeams: game.fixedTeams?.map((team) => ({
      id: team.id,
      teamNumber: team.teamNumber,
      playerIds: team.players.map((p) => p.userId),
    })),
    userGenderById: new Map(game.participants.map((p) => [p.userId, p.user.gender])),
  };
  
  if (game.winnerOfGame === WinnerOfGame.BY_SCORES_DELTA) {
    result = calculateByScoresDeltaOutcomes(
      players, 
      roundResults,
      pointsPerWin,
      pointsPerTie,
      pointsPerLoose,
      ballsInGames,
      game.sport,
      game.entityType,
    );
  } else if (game.winnerOfGame === WinnerOfGame.BY_POINTS) {
    result = calculateByPointsOutcomes(
      players, 
      roundResults,
      pointsPerWin,
      pointsPerTie,
      pointsPerLoose,
      ballsInGames,
      game.sport,
      game.entityType,
    );
  } else {
    result = calculateByMatchesWonOutcomes(
      players, 
      roundResults,
      pointsPerWin,
      pointsPerTie,
      pointsPerLoose,
      ballsInGames,
      game.sport,
      game.entityType,
    );
  }

  const gameOutcomes = applySharedPlacementToOutcomes(
    players,
    roundResults,
    game.winnerOfGame,
    pointsPerWin,
    pointsPerTie,
    pointsPerLoose,
    result.gameOutcomes,
    placementInput,
  );

  return {
    finalOutcomes: gameOutcomes,
    roundOutcomes: result.roundOutcomes,
  };
}

export async function undoGameOutcomes(gameId: string, tx: Prisma.TransactionClient) {
  const game = await tx.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      sport: true,
      affectsRating: true,
      entityType: true,
      parentId: true,
      resultsStatus: true,
      outcomes: true,
      bracketSlot: { select: { id: true } },
    },
  });

  if (!game || game.outcomes.length === 0) {
    return;
  }

  const shouldCascadeBracket =
    game.resultsStatus === ResultsStatus.FINAL && Boolean(game.bracketSlot);

  const isLeagueRoundGame =
    game.entityType === EntityType.LEAGUE && Boolean(game.parentId);

  if (game.affectsRating && !isLeagueRoundGame) {
    await LeagueGameResultsService.unsyncGameResults(gameId, tx);
  }
  await revertForGame(gameId, 'social', tx);
  await revertForGame(gameId, 'outcomes', tx);

  const playStreakRecomputeUserIds = new Set<string>();

  for (const outcome of game.outcomes) {
    const user = await tx.user.findUnique({
      where: { id: outcome.userId },
      select: {
        id: true,
        totalPoints: true,
        sportProfiles: {
          where: { sport: game.sport },
          select: {
            sport: true,
            level: true,
            reliability: true,
            ratingUncertainty: true,
            lastRatingActivityAt: true,
            gamesPlayed: true,
            gamesWon: true,
          },
        },
      },
    });
    if (!user) continue;

    const undoSnapshot = resolveUserSportSnapshot(user, game.sport);
    const ratingStatsApplied = resolveRatingStatsAppliedForUndo(outcome.metadata, game.affectsRating);
    const undoDeltas = resolveSportStatsDeltasForUndo(outcome.metadata, outcome.isWinner, game.affectsRating);
    const undoStats = computeUndoSportStatsFromDeltas(undoSnapshot, undoDeltas);
    const uncertaintyMeta = readRatingUncertaintyMetadata(outcome.metadata);
    const undoUncertainty = uncertaintyMeta
      ? {
          ratingUncertainty: uncertaintyMeta.ratingUncertaintyBefore,
          lastRatingActivityAt: uncertaintyMeta.lastRatingActivityAtBefore
            ? new Date(uncertaintyMeta.lastRatingActivityAtBefore)
            : null,
        }
      : {};

    if (readPlayStreakAppliedFromMetadata(outcome.metadata)) {
      playStreakRecomputeUserIds.add(outcome.userId);
    }

    await tx.userSportProfile.upsert({
      where: { userId_sport: { userId: outcome.userId, sport: game.sport } },
      create: {
        userId: outcome.userId,
        sport: game.sport,
        level: ratingStatsApplied
          ? clampSportLevel(outcome.levelBefore)
          : undoSnapshot.level,
        reliability: outcome.reliabilityBefore,
        gamesPlayed: undoStats.gamesPlayed,
        gamesWon: undoStats.gamesWon,
        ...undoUncertainty,
      },
      update: {
        level: ratingStatsApplied
          ? clampSportLevel(outcome.levelBefore)
          : undoSnapshot.level,
        reliability: outcome.reliabilityBefore,
        gamesPlayed: undoStats.gamesPlayed,
        gamesWon: undoStats.gamesWon,
        ...undoUncertainty,
      },
    });

    if (ratingStatsApplied && outcome.pointsEarned > 0) {
      await tx.user.update({
        where: { id: outcome.userId },
        data: {
          totalPoints: computeUndoTotalPoints(
            user.totalPoints,
            outcome.pointsEarned,
            true,
          ),
        },
      });
    }
  }

  await tx.gameOutcome.deleteMany({
    where: { gameId },
  });

  for (const userId of playStreakRecomputeUserIds) {
    await recomputePlayStreakForUserSport(userId, game.sport, tx);
  }

  if (isLeagueRoundGame && game.parentId) {
    await LeagueStandingsRecalculateService.recalculateFromPlayedGames(game.parentId, tx);
  }

  if (shouldCascadeBracket) {
    await BracketAdvancementService.onBracketGameResultsUndone(gameId, tx);
  }
}

export async function applyGameOutcomes(
  gameId: string,
  finalOutcomes: Array<{
    userId: string;
    levelChange: number;
    reliabilityChange: number;
    pointsEarned: number;
    position?: number;
    isWinner?: boolean;
    wins?: number;
    ties?: number;
    losses?: number;
    scoresMade?: number;
    scoresLost?: number;
  }>,
  roundOutcomes: Record<number, Array<{
    userId: string;
    levelChange: number;
  }>>,
  tx: Prisma.TransactionClient
): Promise<{ wasEdited: boolean; shouldResolveBets: boolean; bracketCreatedGameIds: string[] }> {
  const game = await tx.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      entityType: true,
      affectsRating: true,
      sport: true,
      winnerOfGame: true,
      finishedDate: true,
      endTime: true,
      startTime: true,
      rounds: {
        orderBy: { roundNumber: 'asc' },
      },
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const playAtForStreak = game.finishedDate ?? game.endTime ?? game.startTime ?? new Date();

  const uncappedLevelByUser = new Map<string, number>();

  if (game.affectsRating) {
    for (const outcome of finalOutcomes) {
      if (outcome.levelChange >= 0) continue;
      if (
        !isPlacementProtectedFromNegativeRating(
          game.entityType,
          outcome.position ?? null,
          game.affectsRating,
        )
      ) {
        continue;
      }
      uncappedLevelByUser.set(outcome.userId, outcome.levelChange);
      outcome.levelChange = 0;
    }
  }

  console.log(`[APPLY GAME OUTCOMES] Applying level/reliability changes and updating player stats for game ${gameId}`);
  for (const outcome of finalOutcomes) {
    const user = await tx.user.findUnique({
      where: { id: outcome.userId },
      select: {
        id: true,
        sportProfiles: {
          where: { sport: game.sport },
          select: {
            sport: true,
            level: true,
            reliability: true,
            ratingUncertainty: true,
            lastRatingActivityAt: true,
            gamesPlayed: true,
            gamesWon: true,
            playStreakCount: true,
            playStreakBest: true,
            playStreakLastPlayAt: true,
            playStreakWeekStartAt: true,
          },
        },
      },
    });

    if (!user) continue;

    const sportSnapshot = resolveUserSportSnapshot(user, game.sport);
    const levelBefore = sportSnapshot.level;
    const reliabilityBefore = sportSnapshot.reliability;
    const ratingStatsApplied = game.affectsRating;
    const stampsActivity = countsAsRatingActivity(game);
    const uncertaintyBefore = sportSnapshot.ratingUncertainty;
    const uncertaintyUsed = ratingStatsApplied
      ? accrueRatingUncertainty(uncertaintyBefore, sportSnapshot.lastRatingActivityAt)
      : uncertaintyBefore;
    const uncertaintyAfter = ratingStatsApplied
      ? ratingUncertaintyAfterFinishedGame(uncertaintyUsed)
      : uncertaintyBefore;
    const levelAfter = computeLevelAfter(levelBefore, outcome.levelChange);
    const reliabilityAfter = clampReliability(reliabilityBefore + outcome.reliabilityChange);
    const actualLevelChange = levelAfter - levelBefore;
    const actualReliabilityChange = reliabilityAfter - reliabilityBefore;
    const storedPosition = outcome.position ?? null;
    const isWinner = outcome.isWinner ?? false;

    const sportStatsDeltas = computeSportStatsDeltas(ratingStatsApplied, isWinner);
    let mergedMetadata = mergeSportStatsDeltasMetadata(
      mergeRatingStatsAppliedMetadata(
        mergePlacementRatingFloorMetadata(undefined, uncappedLevelByUser.get(outcome.userId)),
        ratingStatsApplied,
      ),
      sportStatsDeltas,
    );
    if (ratingStatsApplied) {
      mergedMetadata = mergeRatingUncertaintyMetadata(mergedMetadata, {
        ratingUncertaintyBefore: uncertaintyBefore,
        ratingUncertaintyUsed: uncertaintyUsed,
        ratingUncertaintyAfter: uncertaintyAfter,
        lastRatingActivityAtBefore: sportSnapshot.lastRatingActivityAt
          ? sportSnapshot.lastRatingActivityAt.toISOString()
          : null,
      });
    } else if (stampsActivity) {
      mergedMetadata = mergeRatingUncertaintyMetadata(mergedMetadata, {
        ratingUncertaintyBefore: uncertaintyBefore,
        ratingUncertaintyUsed: uncertaintyBefore,
        ratingUncertaintyAfter: uncertaintyBefore,
        lastRatingActivityAtBefore: sportSnapshot.lastRatingActivityAt
          ? sportSnapshot.lastRatingActivityAt.toISOString()
          : null,
      });
    }

    const playAt = playAtForStreak;
    let playStreakUpdate: {
      playStreakCount: number;
      playStreakBest: number;
      playStreakLastPlayAt: Date;
      playStreakWeekStartAt: Date;
    } | null = null;

    if (countsForPlayStreak(game) && sportStatsDeltas.gamesPlayedDelta > 0) {
      const timezone = await getUserTimezone(outcome.userId);
      const priorAts = await loadQualifyingPlayAts(outcome.userId, game.sport, tx, {
        excludeGameId: gameId,
      });
      const beforeState = recomputePlayStreak(priorAts, timezone, playAt);
      const afterState = recomputePlayStreak([...priorAts, playAt], timezone, playAt);
      const advanced =
        afterState.count > beforeState.count ||
        (beforeState.count === 0 && afterState.count === 1);
      playStreakUpdate = {
        playStreakCount: afterState.count,
        playStreakBest: afterState.best,
        playStreakLastPlayAt: afterState.lastPlayAt ?? playAt,
        playStreakWeekStartAt: afterState.weekStartAt ?? playAt,
      };
      mergedMetadata = mergePlayStreakMetadata(mergedMetadata, {
        applied: true,
        advanced,
        before: {
          count: beforeState.count,
          best: beforeState.best,
          lastPlayAt: beforeState.lastPlayAt ? beforeState.lastPlayAt.toISOString() : null,
        },
        after: {
          count: afterState.count,
          best: afterState.best,
          lastPlayAt: afterState.lastPlayAt ? afterState.lastPlayAt.toISOString() : null,
        },
      });
    }

    await tx.gameOutcome.upsert({
      where: {
        gameId_userId: {
          gameId,
          userId: outcome.userId,
        },
      },
      create: {
        gameId,
        userId: outcome.userId,
        levelBefore,
        levelAfter,
        levelChange: actualLevelChange,
        reliabilityBefore,
        reliabilityAfter,
        reliabilityChange: actualReliabilityChange,
        pointsEarned: outcome.pointsEarned,
        position: storedPosition ?? undefined,
        isWinner,
        wins: outcome.wins || 0,
        ties: outcome.ties || 0,
        losses: outcome.losses || 0,
        scoresMade: outcome.scoresMade || 0,
        scoresLost: outcome.scoresLost || 0,
        metadata: mergedMetadata,
      },
      update: {
        levelBefore,
        levelAfter,
        levelChange: actualLevelChange,
        reliabilityBefore,
        reliabilityAfter,
        reliabilityChange: actualReliabilityChange,
        pointsEarned: outcome.pointsEarned,
        isWinner,
        wins: outcome.wins || 0,
        ties: outcome.ties || 0,
        losses: outcome.losses || 0,
        scoresMade: outcome.scoresMade || 0,
        scoresLost: outcome.scoresLost || 0,
        metadata: mergedMetadata,
      },
    });

    const appliedStats = computeApplySportStats(
      sportSnapshot,
      ratingStatsApplied,
      levelAfter,
      reliabilityAfter,
      isWinner,
    );

    await tx.userSportProfile.upsert({
      where: { userId_sport: { userId: outcome.userId, sport: game.sport } },
      create: {
        userId: outcome.userId,
        sport: game.sport,
        level: appliedStats.level,
        reliability: appliedStats.reliability,
        gamesPlayed: appliedStats.gamesPlayed,
        gamesWon: appliedStats.gamesWon,
        ...(playStreakUpdate ?? {}),
        ...(ratingStatsApplied
          ? {
              ratingUncertainty: uncertaintyAfter,
              lastRatingActivityAt: playAt,
            }
          : stampsActivity
            ? { lastRatingActivityAt: playAt }
            : {}),
      },
      update: {
        level: appliedStats.level,
        reliability: appliedStats.reliability,
        gamesPlayed: appliedStats.gamesPlayed,
        gamesWon: appliedStats.gamesWon,
        ...(playStreakUpdate ?? {}),
        ...(ratingStatsApplied
          ? {
              ratingUncertainty: uncertaintyAfter,
              lastRatingActivityAt: playAt,
            }
          : stampsActivity
            ? { lastRatingActivityAt: playAt }
            : {}),
      },
    });

    await ensureSportInEnabled(outcome.userId, game.sport, tx);

    if (ratingStatsApplied && outcome.pointsEarned > 0) {
      await tx.user.update({
        where: { id: outcome.userId },
        data: { totalPoints: { increment: outcome.pointsEarned } },
      });
    }
  }

  const updatedGame = await tx.game.findUnique({
    where: { id: gameId },
    select: { startTime: true, endTime: true, resultsStatus: true, cityId: true, timeIsSet: true, entityType: true, finishedDate: true },
  });

  if (updatedGame) {
    const cityTimezone = await getUserTimezoneFromCityId(updatedGame.cityId);
    const previousResultsStatus = updatedGame.resultsStatus;
    
    const isResultsBased = isResultsBasedEntityType(updatedGame.entityType);
    
    const updateData: {
      resultsStatus: 'FINAL';
      status: 'FINISHED' | 'ANNOUNCED' | 'STARTED' | 'ARCHIVED';
      finishedDate?: Date;
    } = {
      resultsStatus: 'FINAL',
      status: 'FINISHED',
    };
    
    if (ARCHIVE_BY_FINISHED_DATE_TYPES.includes(updatedGame.entityType)) {
      updateData.finishedDate = new Date();
    } else if (!isResultsBased) {
      updateData.status = calculateGameStatus({
        startTime: updatedGame.startTime,
        endTime: updatedGame.endTime,
        resultsStatus: 'FINAL',
        timeIsSet: updatedGame.timeIsSet,
        finishedDate: updatedGame.finishedDate,
        entityType: updatedGame.entityType,
      }, cityTimezone);
    }

    if (previousResultsStatus !== 'FINAL') {
      await BracketAdvancementService.assertPlayInCompleteForMainBracketGame(gameId, tx);
    }
    
    await tx.game.update({
      where: { id: gameId },
      data: updateData,
    });

    if (updateData.status === 'FINISHED' || updateData.status === 'ARCHIVED') {
      await cleanupInviteParticipantsForEndedGame(gameId, tx);
    }

    await resetMatchTimersInGameTx(tx, gameId);

    for (const outcome of finalOutcomes) {
      const gameOutcome = await tx.gameOutcome.findUnique({
        where: {
          gameId_userId: {
            gameId,
            userId: outcome.userId,
          },
        },
      });

      if (!gameOutcome) {
        continue;
      }

      await createGameEvent(tx, {
        userId: outcome.userId,
        gameId,
        sport: game.sport,
        linkEntityType: game.entityType,
        affectsRating: game.affectsRating,
        levelBefore: gameOutcome.levelBefore,
        levelAfter: gameOutcome.levelAfter,
        levelChange: gameOutcome.levelChange,
      });
    }

    await rebuildLeagueSeasonStandingsIfNeeded(gameId, tx);

    let bracketCreatedGameIds: string[] = [];
    if (previousResultsStatus !== 'FINAL') {
      bracketCreatedGameIds = await BracketAdvancementService.onGameFinalized(gameId, tx);
    }

    if (game.entityType !== EntityType.BAR && game.entityType !== EntityType.LEAGUE_SEASON) {
      await SocialParticipantLevelService.applySocialParticipantLevelChanges(gameId, tx);
    }
    
    return {
      wasEdited: previousResultsStatus === 'FINAL' || previousResultsStatus === 'IN_PROGRESS',
      shouldResolveBets: previousResultsStatus !== 'FINAL',
      bracketCreatedGameIds,
    };
  }
  
  return { wasEdited: false, shouldResolveBets: false, bracketCreatedGameIds: [] as string[] };
}

export async function recalculateGameOutcomes(gameId: string) {
  console.log(`[RECALCULATE GAME OUTCOMES] Starting recalculation for game ${gameId}`);
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      participants: true,
    },
  });

  if (!game) {
    console.log(`[RECALCULATE GAME OUTCOMES] Game ${gameId} not found`);
    throw new ApiError(404, 'Game not found');
  }

  console.log(`[RECALCULATE GAME OUTCOMES] Game ${gameId} configuration: winnerOfMatch=${game.winnerOfMatch}, winnerOfGame=${game.winnerOfGame}`);

  let wasEdited = false;
  
  const result = await prisma.$transaction(async (tx) => {
    await tx.gameParticipant.updateMany({
      where: { gameId },
      data: { activeMatchId: null },
    });
    console.log(`[RECALCULATE GAME OUTCOMES] Step 1: Undoing existing outcomes`);
    await undoGameOutcomes(gameId, tx);

    console.log(`[RECALCULATE GAME OUTCOMES] Step 2: Updating match winners based on set scores`);
    await updateMatchWinners(gameId, tx);

    console.log(`[RECALCULATE GAME OUTCOMES] Step 3: Generating new outcomes`);
    const outcomeData = await generateGameOutcomes(gameId, tx);

    console.log(`[RECALCULATE GAME OUTCOMES] Step 4: Applying outcomes (${outcomeData.finalOutcomes.length} final outcomes, ${Object.keys(outcomeData.roundOutcomes).length} rounds)`);
    const applyResult = await applyGameOutcomes(
      gameId,
      outcomeData.finalOutcomes,
      outcomeData.roundOutcomes,
      tx
    );
    
    wasEdited = applyResult.wasEdited;
    const shouldResolveBets = applyResult.shouldResolveBets;
    const bracketCreatedGameIds = applyResult.bracketCreatedGameIds;

    const game = await tx.game.findUnique({
      where: { id: gameId },
      include: {
        rounds: {
          include: {
            matches: {
              include: {
                teams: {
                  include: {
                    players: {
                      include: {
                        user: {
                          select: USER_SELECT_WITH_SPORT_PROFILES,
                        },
                      },
                    },
                  },
                },
                sets: { orderBy: { setNumber: 'asc' } },
              },
            },
            outcomes: {
              include: {
                user: {
                  select: USER_SELECT_WITH_SPORT_PROFILES,
                },
              },
            },
          },
          orderBy: { roundNumber: 'asc' },
        },
        outcomes: {
          include: {
            user: {
              select: USER_SELECT_WITH_SPORT_PROFILES,
            },
          },
          orderBy: { position: 'asc' },
        },
      },
    });
    
    return {
      game: game ? projectGameUsersForSportContext(game) : game,
      shouldResolveBets,
      bracketCreatedGameIds,
    };
  });
  
  console.log(`[RECALCULATE GAME OUTCOMES] Transaction completed, wasEdited: ${wasEdited}`);

  await cancelAllMatchTimersForGame(gameId);

  await attemptBetResolutionAfterOutcomesRecalc(gameId, result.shouldResolveBets);

  const bracketCreatedGameIds = result.bracketCreatedGameIds ?? [];
  if (bracketCreatedGameIds.length > 0) {
    setImmediate(() => {
      BracketGameNotificationService.notifyCreatedGames(bracketCreatedGameIds);
    });
  }

  console.log(`[TELEGRAM NOTIFICATION] Preparing to send notifications for game ${gameId}`);
  
  setImmediate(() => {
    console.log(`[TELEGRAM NOTIFICATION] Calling sendGameFinished for game ${gameId}, isEdited: ${wasEdited}`);
    resultsSenderService.sendGameFinished(gameId, wasEdited).catch((error: unknown) => {
      console.error(`Failed to send game finished notifications for game ${gameId}:`, error);
    });
  });

  return result.game;
}

