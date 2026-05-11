import prisma from '../config/database';
import { cancelAllMatchTimersForGame } from './results/matchTimer.service';
import { matchTimerCoordinator } from './results/matchTimerCoordinator';
import { ApiError } from '../utils/ApiError';
import { USER_SELECT_FIELDS } from '../utils/constants';
import { getUserTimezoneFromCityId } from './user-timezone.service';
import { LeagueGameResultsService } from './league/gameResults.service';
import { SocialParticipantLevelService } from './socialParticipantLevel.service';
import { calculateGameStatus } from '../utils/gameStatus';
import { MatchSetRole } from '@prisma/client';
import { parseMatchSetRole } from './results/matchSetRole';
import { assertMatchNormalizedSetsValid, type NormalizedMatchSetRow } from './results/matchSetsValidation';
import { stripLiveScoringFromMatchMetadata } from './results/matchLiveScoring.service';

const SUPPLEMENTAL_SET_SCORE_MAX = 9999;


export async function getGameResults(gameId: string) {
  const game = await prisma.game.findUnique({
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
                        select: USER_SELECT_FIELDS,
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
                select: USER_SELECT_FIELDS,
              },
            },
          },
        },
        orderBy: { roundNumber: 'asc' },
      },
      outcomes: {
        include: {
          user: {
                  select: {
                    ...USER_SELECT_FIELDS,
                    reliability: true,
                  },
          },
        },
        orderBy: { position: 'asc' },
      },
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  return game;
}

export async function getRoundResults(roundId: string) {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      matches: {
        include: {
          teams: {
            include: {
              players: {
                include: {
                  user: {
                    select: USER_SELECT_FIELDS,
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
            select: USER_SELECT_FIELDS,
          },
        },
      },
    },
  });

  if (!round) {
    throw new ApiError(404, 'Round not found');
  }

  return round;
}

export async function getMatchResults(matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      teams: {
        include: {
          players: {
            include: {
              user: {
                select: USER_SELECT_FIELDS,
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

  return match;
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

  await prisma.$transaction(async (tx) => {
    if (game.outcomes.length > 0) {
      if (game.affectsRating) {
        await LeagueGameResultsService.unsyncGameResults(gameId, tx);
      }
      for (const outcome of game.outcomes) {
        await tx.user.update({
          where: { id: outcome.userId },
          data: game.affectsRating
            ? {
                level: Math.max(1.0, Math.min(7.0, outcome.levelBefore)),
                reliability: outcome.reliabilityBefore,
                reliabilityDecayPostGraceDaysApplied: 0,
                totalPoints: { decrement: outcome.pointsEarned },
                gamesPlayed: { decrement: 1 },
                gamesWon: outcome.isWinner ? { decrement: 1 } : undefined,
              }
            : { reliability: outcome.reliabilityBefore, reliabilityDecayPostGraceDaysApplied: 0 },
        });
      }
    }

    await tx.round.deleteMany({
      where: { gameId },
    });

    await tx.gameOutcome.deleteMany({
      where: { gameId },
    });

    await SocialParticipantLevelService.revertSocialParticipantLevelChanges(gameId, tx);

    await tx.levelChangeEvent.deleteMany({
      where: {
        gameId: gameId,
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
          resultsStatus: 'NONE',
          finishedDate: null,
          metadata: {
            ...((game.metadata as any) || {}),
          },
          status: calculateGameStatus({
            startTime: updatedGame.startTime,
            endTime: updatedGame.endTime,
            resultsStatus: 'NONE',
            timeIsSet: updatedGame.timeIsSet,
            entityType: updatedGame.entityType,
          }, cityTimezone),
        },
      });
    }
  });
}

export async function resetGameResults(gameId: string) {
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

  await prisma.$transaction(async (tx) => {
    if (game.outcomes.length > 0) {
      if (game.affectsRating) {
        await LeagueGameResultsService.unsyncGameResults(gameId, tx);
      }
      for (const outcome of game.outcomes) {
        await tx.user.update({
          where: { id: outcome.userId },
          data: game.affectsRating
            ? {
                level: Math.max(1.0, Math.min(7.0, outcome.levelBefore)),
                reliability: outcome.reliabilityBefore,
                reliabilityDecayPostGraceDaysApplied: 0,
                totalPoints: { decrement: outcome.pointsEarned },
                gamesPlayed: { decrement: 1 },
                gamesWon: outcome.isWinner ? { decrement: 1 } : undefined,
              }
            : { reliability: outcome.reliabilityBefore, reliabilityDecayPostGraceDaysApplied: 0 },
        });
      }
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

    await tx.gameOutcome.deleteMany({
      where: { gameId },
    });

    await SocialParticipantLevelService.revertSocialParticipantLevelChanges(gameId, tx);

    await tx.levelChangeEvent.deleteMany({
      where: {
        gameId: gameId,
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
          resultsStatus: 'NONE',
          finishedDate: null,
          metadata: {
            ...((game.metadata as any) || {}),
          },
          status: calculateGameStatus({
            startTime: updatedGame.startTime,
            endTime: updatedGame.endTime,
            resultsStatus: 'NONE',
            timeIsSet: updatedGame.timeIsSet,
            entityType: updatedGame.entityType,
          }, cityTimezone),
        },
      });
    }
  });
}

export async function editGameResults(gameId: string) {
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

  await prisma.$transaction(async (tx) => {
    if (game.outcomes.length > 0) {
      if (game.affectsRating) {
        await LeagueGameResultsService.unsyncGameResults(gameId, tx);
      }
      for (const outcome of game.outcomes) {
        await tx.user.update({
          where: { id: outcome.userId },
          data: game.affectsRating
            ? {
                level: Math.max(1.0, Math.min(7.0, outcome.levelBefore)),
                reliability: outcome.reliabilityBefore,
                reliabilityDecayPostGraceDaysApplied: 0,
                totalPoints: { decrement: outcome.pointsEarned },
                gamesPlayed: { decrement: 1 },
                gamesWon: outcome.isWinner ? { decrement: 1 } : undefined,
              }
            : { reliability: outcome.reliabilityBefore, reliabilityDecayPostGraceDaysApplied: 0 },
        });
      }
    }

    await tx.gameOutcome.deleteMany({
      where: { gameId },
    });

    await tx.roundOutcome.deleteMany({
      where: {
        round: {
          gameId,
        },
      },
    });

    await SocialParticipantLevelService.revertSocialParticipantLevelChanges(gameId, tx);

    await tx.levelChangeEvent.deleteMany({
      where: {
        gameId: gameId,
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
      }
  });
}

export async function syncResults(gameId: string, rounds: any[]) {
  const normalizedRounds = Array.isArray(rounds) ? rounds : [];
  console.log(`[SYNC RESULTS] gameId=${gameId} roundsCount=${normalizedRounds.length}`);

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      participants: true,
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  for (let i = 0; i < normalizedRounds.length; i++) {
    const r = normalizedRounds[i];
    if (!r || typeof r?.id !== 'string') {
      throw new ApiError(400, `Round at index ${i} must have a string id`);
    }
    const matches = r.matches ?? [];
    for (let j = 0; j < matches.length; j++) {
      const m = matches[j];
      if (!m || typeof m?.id !== 'string') {
        throw new ApiError(400, `Match at round ${i} index ${j} must have a string id`);
      }
    }
  }

  await cancelAllMatchTimersForGame(gameId);

  await prisma.$transaction(async (tx) => {
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

    for (let roundIndex = 0; roundIndex < normalizedRounds.length; roundIndex++) {
      const roundData = normalizedRounds[roundIndex];
      const round = await tx.round.create({
        data: {
          id: roundData.id,
          gameId,
          roundNumber: roundIndex + 1,
        },
      });

      for (let matchIndex = 0; matchIndex < (roundData.matches || []).length; matchIndex++) {
        const matchData = roundData.matches[matchIndex];
        const match = await tx.match.create({
          data: {
            id: matchData.id,
            roundId: round.id,
            matchNumber: matchIndex + 1,
            courtId: matchData.courtId || null,
          },
        });

        const teamA = await tx.team.create({
          data: {
            matchId: match.id,
            teamNumber: 1,
          },
        });

        const teamB = await tx.team.create({
          data: {
            matchId: match.id,
            teamNumber: 2,
          },
        });

        for (const playerId of matchData.teamA || []) {
          await tx.teamPlayer.create({
            data: {
              teamId: teamA.id,
              userId: playerId,
            },
          });
        }

        for (const playerId of matchData.teamB || []) {
          await tx.teamPlayer.create({
            data: {
              teamId: teamB.id,
              userId: playerId,
            },
          });
        }

        for (let setIndex = 0; setIndex < (matchData.sets || []).length; setIndex++) {
          const setData = matchData.sets[setIndex];
          await tx.set.create({
            data: {
              matchId: match.id,
              setNumber: setIndex + 1,
              teamAScore: setData.teamA || 0,
              teamBScore: setData.teamB || 0,
              isTieBreak: setData.isTieBreak || false,
              role: parseMatchSetRole((setData as { role?: unknown }).role),
            },
          });
        }
      }
    }

    const cityTimezone = await getUserTimezoneFromCityId(game.cityId);
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
  });
}

export async function createRound(gameId: string, roundId: string) {

  const roundCount = await prisma.round.count({ where: { gameId } });

  await prisma.round.create({
    data: {
      id: roundId,
      gameId,
      roundNumber: roundCount + 1,
    },
  });

  const gameRow = await prisma.game.findUnique({
    where: { id: gameId },
    select: { startTime: true, endTime: true, cityId: true, timeIsSet: true, entityType: true },
  });
  if (!gameRow) {
    throw new ApiError(404, 'Game not found');
  }
  const cityTimezone = await getUserTimezoneFromCityId(gameRow.cityId);
  await prisma.game.update({
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

export async function deleteRound(gameId: string, roundId: string) {

  const round = await prisma.round.findUnique({
    where: { id: roundId },
  });

  if (!round) {
    throw new ApiError(404, 'Round not found');
  }

  if (round.gameId !== gameId) {
    throw new ApiError(403, 'Round does not belong to this game');
  }

  await prisma.$transaction(async (tx) => {
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
  });
}

export async function createMatch(gameId: string, roundId: string, matchId: string) {

  const round = await prisma.round.findUnique({
    where: { id: roundId },
  });

  if (!round) {
    throw new ApiError(404, 'Round not found');
  }

  if (round.gameId !== gameId) {
    throw new ApiError(403, 'Round does not belong to this game');
  }

  const matchCount = await prisma.match.count({ where: { roundId } });

  await prisma.$transaction(async (tx) => {
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
  });
}

export async function deleteMatch(gameId: string, matchId: string) {

  const match = await prisma.match.findUnique({
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

  await prisma.$transaction(async (tx) => {
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
  });
}

export async function updateMatch(
  gameId: string,
  matchId: string,
  matchData: {
    teamA: string[];
    teamB: string[];
    sets: Array<{ teamA: number; teamB: number; isTieBreak?: boolean; role?: string }>;
    courtId?: string;
  }
) {

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      teams: {
        orderBy: { teamNumber: 'asc' },
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

  const game = await prisma.game.findUnique({
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
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const normalizedSets: NormalizedMatchSetRow[] = (matchData.sets || []).map((s) => ({
    teamA: Math.min(SUPPLEMENTAL_SET_SCORE_MAX, Math.max(0, Number(s.teamA) || 0)),
    teamB: Math.min(SUPPLEMENTAL_SET_SCORE_MAX, Math.max(0, Number(s.teamB) || 0)),
    isTieBreak: Boolean(s.isTieBreak),
    role: parseMatchSetRole((s as { role?: unknown }).role),
  }));

  assertMatchNormalizedSetsValid(game, normalizedSets);

  await prisma.$transaction(async (tx) => {
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
        metadata: stripLiveScoringFromMatchMetadata(match.metadata),
      },
    });
  });

  const cityTimezone = await getUserTimezoneFromCityId(game.cityId);
  await prisma.game.update({
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

