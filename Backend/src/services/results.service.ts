import prisma from '../config/database';
import { ApiError } from '../utils/ApiError';
import { USER_SELECT_FIELDS } from '../utils/constants';
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

    const { SocialParticipantLevelService } = await import('./socialParticipantLevel.service');
    await SocialParticipantLevelService.revertSocialParticipantLevelChanges(gameId, tx);

    await tx.levelChangeEvent.deleteMany({
      where: {
        gameId: gameId,
      },
    });

    const updatedGame = await tx.game.findUnique({
      where: { id: gameId },
      select: { startTime: true, endTime: true, cityId: true, timeIsSet: true },
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
            timeIsSet: updatedGame.timeIsSet,
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

    const { SocialParticipantLevelService } = await import('./socialParticipantLevel.service');
    await SocialParticipantLevelService.revertSocialParticipantLevelChanges(gameId, tx);

    await tx.levelChangeEvent.deleteMany({
      where: {
        gameId: gameId,
      },
    });

    const updatedGame = await tx.game.findUnique({
      where: { id: gameId },
      select: { startTime: true, endTime: true, cityId: true, timeIsSet: true },
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
            timeIsSet: updatedGame.timeIsSet,
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

    const { SocialParticipantLevelService } = await import('./socialParticipantLevel.service');
    await SocialParticipantLevelService.revertSocialParticipantLevelChanges(gameId, tx);

    await tx.levelChangeEvent.deleteMany({
      where: {
        gameId: gameId,
      },
    });

    const updatedGame = await tx.game.findUnique({
      where: { id: gameId },
      select: { startTime: true, endTime: true, cityId: true, timeIsSet: true },
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
            timeIsSet: updatedGame.timeIsSet,
          }, cityTimezone),
        },
      });
    }
  });
}

export async function syncResults(gameId: string, rounds: any[]) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      participants: true,
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
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

export async function createRound(gameId: string, roundId: string) {

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

export async function deleteRound(gameId: string, roundId: string) {

  const round = await prisma.round.findUnique({
    where: { id: roundId },
  });

  if (!round) {
    throw new ApiError(404, 'Round not found');
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
  });

  if (!match) {
    throw new ApiError(404, 'Match not found');
  }

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
    sets: Array<{ teamA: number; teamB: number; isTieBreak?: boolean }>;
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
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  // Validate TieBreak rules
  const setsWithTieBreak = (matchData.sets || []).filter((set, _idx) => set.isTieBreak === true);
  
  if (setsWithTieBreak.length > 1) {
    throw new ApiError(400, 'Only one TieBreak can exist per match');
  }

  if (setsWithTieBreak.length === 1) {
    const tieBreakSetIndex = (matchData.sets || []).findIndex(set => set.isTieBreak === true);
    
    if (!game.ballsInGames) {
      throw new ApiError(400, 'TieBreak can only be set when ballsInGames is enabled');
    }

    // Check if this is an odd set starting from 3rd (setIndex 2, 4, 6, 8)
    // 3rd set = index 2, 5th set = index 4, 7th set = index 6, 9th set = index 8
    const isOddSetFromThird = tieBreakSetIndex >= 2 && (tieBreakSetIndex - 2) % 2 === 0;
    if (!isOddSetFromThird) {
      throw new ApiError(400, 'TieBreak can only be set on the 3rd, 5th, 7th, or 9th set');
    }

    // Check if previous sets are equally won by both teams
    if (tieBreakSetIndex >= 2) {
      let teamAWins = 0;
      let teamBWins = 0;

      for (let i = 0; i < tieBreakSetIndex; i++) {
        const set = matchData.sets[i];
        if (set && (set.teamA > 0 || set.teamB > 0)) {
          if (set.teamA > set.teamB) {
            teamAWins++;
          } else if (set.teamB > set.teamA) {
            teamBWins++;
          }
        }
      }

      if (teamAWins !== teamBWins) {
        throw new ApiError(400, 'TieBreak can only be set when previous sets are equally won by both teams');
      }
    }

    // Check if tiebreak set has equal scores
    const tieBreakSet = matchData.sets[tieBreakSetIndex];
    if (tieBreakSet && tieBreakSet.teamA === tieBreakSet.teamB && (tieBreakSet.teamA > 0 || tieBreakSet.teamB > 0)) {
      throw new ApiError(400, 'TieBreak sets cannot have equal scores');
    }

    // Check if it's the last set
    const fixedNumberOfSets = game.fixedNumberOfSets || 0;
    
    let isLastSet: boolean;
    if (fixedNumberOfSets > 0) {
      isLastSet = tieBreakSetIndex === fixedNumberOfSets - 1;
    } else {
      // For dynamic sets, find the last set with scores
      const validSetIndices: number[] = [];
      for (let i = 0; i < (matchData.sets || []).length; i++) {
        const set = matchData.sets[i];
        if (set.teamA > 0 || set.teamB > 0) {
          validSetIndices.push(i);
        }
      }
      
      if (validSetIndices.length === 0) {
        // If no valid sets exist, the first set (index 0) is considered the last set
        isLastSet = tieBreakSetIndex === 0;
      } else {
        // The last set is the highest index among valid sets
        const lastValidSetIndex = Math.max(...validSetIndices);
        isLastSet = tieBreakSetIndex === lastValidSetIndex;
      }
    }

    if (!isLastSet) {
      throw new ApiError(400, 'TieBreak can only be set on the last set of a match');
    }
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
          isTieBreak: setData.isTieBreak || false,
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

