import prisma from '../config/database';
import { ApiError } from '../utils/ApiError';
import { USER_SELECT_FIELDS } from '../utils/constants';
import { canModifyResults } from '../utils/parentGamePermissions';
import { getUserTimezoneFromCityId } from './user-timezone.service';


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
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  level: true,
                },
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
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      avatar: true,
                      level: true,
                    },
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
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              level: true,
            },
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
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  level: true,
                },
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

export async function deleteGameResults(gameId: string, requestUserId: string) {
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

  const canModify = await canModifyResults(gameId, requestUserId, game.resultsByAnyone);

  if (!canModify) {
    throw new ApiError(403, 'Only game owners/admins can delete results');
  }

  if (game.status === 'ARCHIVED') {
    throw new ApiError(403, 'Cannot delete results for archived games');
  }

  await prisma.$transaction(async (tx) => {
    if (game.affectsRating && game.outcomes.length > 0) {
      const { LeagueGameResultsService } = await import('./league/gameResults.service');
      await LeagueGameResultsService.unsyncGameResults(gameId, tx);

      for (const outcome of game.outcomes) {
        await tx.user.update({
          where: { id: outcome.userId },
          data: {
            level: Math.max(1.0, Math.min(7.0, outcome.levelBefore)),
            reliability: outcome.reliabilityBefore,
            totalPoints: { decrement: outcome.pointsEarned },
            gamesPlayed: { decrement: 1 },
            gamesWon: outcome.isWinner ? { decrement: 1 } : undefined,
          },
        });
      }
    }

    await tx.round.deleteMany({
      where: { gameId },
    });

    await tx.gameOutcome.deleteMany({
      where: { gameId },
    });

    await tx.levelChangeEvent.deleteMany({
      where: {
        gameId: gameId,
      },
    });

    const updatedGame = await tx.game.findUnique({
      where: { id: gameId },
      select: { startTime: true, endTime: true, cityId: true },
    });
    
    if (updatedGame) {
      const cityTimezone = await getUserTimezoneFromCityId(updatedGame.cityId);
      
      const { calculateGameStatus } = await import('../utils/gameStatus');
      await tx.game.update({
        where: { id: gameId },
        data: {
          resultsStatus: 'NONE',
          metadata: {
            ...((game.metadata as any) || {}),
          },
          status: calculateGameStatus({
            startTime: updatedGame.startTime,
            endTime: updatedGame.endTime,
            resultsStatus: 'NONE',
          }, cityTimezone),
        },
      });
    }
  });
}

export async function resetGameResults(gameId: string, requestUserId: string) {
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

  const canModify = await canModifyResults(gameId, requestUserId, game.resultsByAnyone);

  if (!canModify) {
    throw new ApiError(403, 'Only game owners/admins can reset results');
  }

  if (game.status === 'ARCHIVED') {
    throw new ApiError(403, 'Cannot reset results for archived games');
  }

  await prisma.$transaction(async (tx) => {
    if (game.affectsRating && game.outcomes.length > 0) {
      const { LeagueGameResultsService } = await import('./league/gameResults.service');
      await LeagueGameResultsService.unsyncGameResults(gameId, tx);

      for (const outcome of game.outcomes) {
        await tx.user.update({
          where: { id: outcome.userId },
          data: {
            level: Math.max(1.0, Math.min(7.0, outcome.levelBefore)),
            reliability: outcome.reliabilityBefore,
            totalPoints: { decrement: outcome.pointsEarned },
            gamesPlayed: { decrement: 1 },
            gamesWon: outcome.isWinner ? { decrement: 1 } : undefined,
          },
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

    await tx.levelChangeEvent.deleteMany({
      where: {
        gameId: gameId,
      },
    });

    const updatedGame = await tx.game.findUnique({
      where: { id: gameId },
      select: { startTime: true, endTime: true, cityId: true },
    });
    
    if (updatedGame) {
      const cityTimezone = await getUserTimezoneFromCityId(updatedGame.cityId);
      
      const { calculateGameStatus } = await import('../utils/gameStatus');
      await tx.game.update({
        where: { id: gameId },
        data: {
          resultsStatus: 'NONE',
          metadata: {
            ...((game.metadata as any) || {}),
          },
          status: calculateGameStatus({
            startTime: updatedGame.startTime,
            endTime: updatedGame.endTime,
            resultsStatus: 'NONE',
          }, cityTimezone),
        },
      });
    }
  });
}

export async function editGameResults(gameId: string, requestUserId: string) {
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

  const canModify = await canModifyResults(gameId, requestUserId, game.resultsByAnyone);

  if (!canModify) {
    throw new ApiError(403, 'Only game owners/admins can edit results');
  }

  if (game.status === 'ARCHIVED') {
    throw new ApiError(403, 'Cannot edit results for archived games');
  }

  if (game.resultsStatus !== 'FINAL') {
    throw new ApiError(400, 'Can only edit results with FINAL status');
  }

  await prisma.$transaction(async (tx) => {
    if (game.affectsRating && game.outcomes.length > 0) {
      const { LeagueGameResultsService } = await import('./league/gameResults.service');
      await LeagueGameResultsService.unsyncGameResults(gameId, tx);

      for (const outcome of game.outcomes) {
        await tx.user.update({
          where: { id: outcome.userId },
          data: {
            level: Math.max(1.0, Math.min(7.0, outcome.levelBefore)),
            reliability: outcome.reliabilityBefore,
            totalPoints: { decrement: outcome.pointsEarned },
            gamesPlayed: { decrement: 1 },
            gamesWon: outcome.isWinner ? { decrement: 1 } : undefined,
          },
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

    await tx.levelChangeEvent.deleteMany({
      where: {
        gameId: gameId,
      },
    });

    const updatedGame = await tx.game.findUnique({
      where: { id: gameId },
      select: { startTime: true, endTime: true, cityId: true },
    });
    
    if (updatedGame) {
      const cityTimezone = await getUserTimezoneFromCityId(updatedGame.cityId);
      
      const { calculateGameStatus } = await import('../utils/gameStatus');
      await tx.game.update({
        where: { id: gameId },
        data: {
          resultsStatus: 'IN_PROGRESS',
          status: calculateGameStatus({
            startTime: updatedGame.startTime,
            endTime: updatedGame.endTime,
            resultsStatus: 'IN_PROGRESS',
          }, cityTimezone),
        },
      });
    }
  });
}

export async function syncResults(gameId: string, rounds: any[], requestUserId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      participants: true,
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const canModify = await canModifyResults(gameId, requestUserId, game.resultsByAnyone);

  if (!canModify) {
    throw new ApiError(403, 'Only game owners/admins can modify results');
  }

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

    for (let roundIndex = 0; roundIndex < rounds.length; roundIndex++) {
      const roundData = rounds[roundIndex];
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
            },
          });
        }
      }
    }

    await tx.game.update({
      where: { id: gameId },
      data: {
        resultsStatus: 'IN_PROGRESS',
      },
    });
  });
}

export async function createRound(gameId: string, roundId: string, name: string, requestUserId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: { participants: true },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const canModify = await canModifyResults(gameId, requestUserId, game.resultsByAnyone);
  if (!canModify) {
    throw new ApiError(403, 'Only game owners/admins can modify results');
  }

  const roundCount = await prisma.round.count({ where: { gameId } });

  await prisma.round.create({
    data: {
      id: roundId,
      gameId,
      roundNumber: roundCount + 1,
    },
  });

  await prisma.game.update({
    where: { id: gameId },
    data: {
      resultsStatus: 'IN_PROGRESS',
    },
  });
}

export async function deleteRound(gameId: string, roundId: string, requestUserId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: { participants: true },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const canModify = await canModifyResults(gameId, requestUserId, game.resultsByAnyone);
  if (!canModify) {
    throw new ApiError(403, 'Only game owners/admins can modify results');
  }

  const round = await prisma.round.findUnique({
    where: { id: roundId },
  });

  if (!round) {
    throw new ApiError(404, 'Round not found');
  }

  await prisma.$transaction(async (tx) => {
    const deletedRoundNumber = round.roundNumber;
    await tx.round.delete({ where: { id: roundId } });

    await tx.round.updateMany({
      where: {
        gameId,
        roundNumber: { gt: deletedRoundNumber },
      },
      data: {
        roundNumber: { decrement: 1 },
      },
    });
  });
}

export async function createMatch(gameId: string, roundId: string, matchId: string, requestUserId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: { participants: true },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const canModify = await canModifyResults(gameId, requestUserId, game.resultsByAnyone);
  if (!canModify) {
    throw new ApiError(403, 'Only game owners/admins can modify results');
  }

  const round = await prisma.round.findUnique({
    where: { id: roundId },
  });

  if (!round) {
    throw new ApiError(404, 'Round not found');
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

export async function deleteMatch(gameId: string, matchId: string, requestUserId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: { participants: true },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const canModify = await canModifyResults(gameId, requestUserId, game.resultsByAnyone);
  if (!canModify) {
    throw new ApiError(403, 'Only game owners/admins can modify results');
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
  });

  if (!match) {
    throw new ApiError(404, 'Match not found');
  }

  await prisma.$transaction(async (tx) => {
    const deletedMatchNumber = match.matchNumber;
    await tx.match.delete({ where: { id: matchId } });

    await tx.match.updateMany({
      where: {
        roundId: match.roundId,
        matchNumber: { gt: deletedMatchNumber },
      },
      data: {
        matchNumber: { decrement: 1 },
      },
    });
  });
}

export async function updateMatch(
  gameId: string,
  matchId: string,
  matchData: {
    teamA: string[];
    teamB: string[];
    sets: Array<{ teamA: number; teamB: number }>;
    courtId?: string;
  },
  requestUserId: string
) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: { participants: true },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const canModify = await canModifyResults(gameId, requestUserId, game.resultsByAnyone);
  if (!canModify) {
    throw new ApiError(403, 'Only game owners/admins can modify results');
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      teams: {
        orderBy: { teamNumber: 'asc' },
      },
    },
  });

  if (!match) {
    throw new ApiError(404, 'Match not found');
  }

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
    for (let i = 0; i < (matchData.sets || []).length; i++) {
      const setData = matchData.sets[i];
      await tx.set.create({
        data: {
          matchId: match.id,
          setNumber: i + 1,
          teamAScore: setData.teamA || 0,
          teamBScore: setData.teamB || 0,
        },
      });
    }
  });

  await prisma.game.update({
    where: { id: gameId },
    data: {
      resultsStatus: 'IN_PROGRESS',
    },
  });
}

