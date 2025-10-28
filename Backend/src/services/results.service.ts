import prisma from '../config/database';
import { ApiError } from '../utils/ApiError';
import { ParticipantRole, RoundStatus, MatchStatus } from '@prisma/client';

interface SetData {
  setNumber: number;
  teamAScore: number;
  teamBScore: number;
}

interface TeamData {
  teamNumber: number;
  playerIds: string[];
  score?: number;
}

interface MatchData {
  matchNumber: number;
  teams: TeamData[];
  sets: SetData[];
  winnerId?: string;
  status?: MatchStatus;
}

interface RoundData {
  roundNumber: number;
  matches: MatchData[];
  status?: RoundStatus;
  outcomes?: {
    userId: string;
    levelChange: number;
  }[];
}

export interface GameResultsData {
  rounds: RoundData[];
  finalOutcomes?: {
    userId: string;
    levelChange: number;
    reliabilityChange: number;
    pointsEarned: number;
    position?: number;
    isWinner?: boolean;
  }[];
}

export async function saveGameResults(
  gameId: string,
  data: GameResultsData,
  requestUserId: string
) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      participants: true,
      fixedTeams: {
        include: {
          players: true,
        },
      },
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const userParticipant = game.participants.find(
    (p) => p.userId === requestUserId && (p.role === ParticipantRole.OWNER || p.role === ParticipantRole.ADMIN)
  );

  if (!userParticipant && !game.resultsByAnyone) {
    throw new ApiError(403, 'Only game owners/admins can save results');
  }

  if (game.hasFixedTeams && game.fixedTeams.length > 0) {
    for (const roundData of data.rounds) {
      for (const matchData of roundData.matches) {
        if (matchData.teams.length !== game.fixedTeams.length) {
          throw new ApiError(
            400,
            `Game has ${game.fixedTeams.length} fixed teams, but match has ${matchData.teams.length} teams`
          );
        }

        for (const teamData of matchData.teams) {
          const fixedTeam = game.fixedTeams.find((ft) => ft.teamNumber === teamData.teamNumber);
          
          if (!fixedTeam) {
            throw new ApiError(400, `No fixed team found with teamNumber ${teamData.teamNumber}`);
          }

          const fixedTeamPlayerIds = fixedTeam.players.map((p) => p.userId).sort();
          const providedPlayerIds = teamData.playerIds.sort();

          if (
            fixedTeamPlayerIds.length !== providedPlayerIds.length ||
            !fixedTeamPlayerIds.every((id, index) => id === providedPlayerIds[index])
          ) {
            throw new ApiError(
              400,
              `Team ${teamData.teamNumber} players do not match fixed team configuration`
            );
          }
        }
      }
    }
  }

  return await prisma.$transaction(async (tx) => {
    for (const roundData of data.rounds) {
      let round = await tx.round.findUnique({
        where: {
          gameId_roundNumber: {
            gameId,
            roundNumber: roundData.roundNumber,
          },
        },
        include: {
          matches: {
            include: {
              teams: {
                include: {
                  players: true,
                },
              },
              sets: true,
            },
          },
        },
      });

      if (!round) {
        round = await tx.round.create({
          data: {
            gameId,
            roundNumber: roundData.roundNumber,
            status: roundData.status || RoundStatus.IN_PROGRESS,
          },
          include: {
            matches: {
              include: {
                teams: {
                  include: {
                    players: true,
                  },
                },
                sets: true,
              },
            },
          },
        });
      } else if (roundData.status) {
        await tx.round.update({
          where: { id: round.id },
          data: { status: roundData.status },
        });
      }

      for (const matchData of roundData.matches) {
        let match = round.matches.find((m) => m.matchNumber === matchData.matchNumber);

        if (!match) {
          match = await tx.match.create({
            data: {
              roundId: round.id,
              matchNumber: matchData.matchNumber,
              status: matchData.status || MatchStatus.IN_PROGRESS,
            },
            include: {
              teams: {
                include: {
                  players: true,
                },
              },
              sets: true,
            },
          });
        } else if (matchData.status) {
          await tx.match.update({
            where: { id: match.id },
            data: {
              status: matchData.status,
              winnerId: matchData.winnerId,
            },
          });
        }

        for (const teamData of matchData.teams) {
          let team = match.teams.find((t) => t.teamNumber === teamData.teamNumber);

          if (!team) {
            team = await tx.team.create({
              data: {
                matchId: match.id,
                teamNumber: teamData.teamNumber,
                score: teamData.score || 0,
              },
              include: {
                players: true,
              },
            });
          } else {
            await tx.team.update({
              where: { id: team.id },
              data: { score: teamData.score || team.score },
            });
          }

          const existingPlayerIds = team.players.map((p) => p.userId);
          const newPlayerIds = teamData.playerIds.filter((id) => !existingPlayerIds.includes(id));

          for (const playerId of newPlayerIds) {
            await tx.teamPlayer.create({
              data: {
                teamId: team.id,
                userId: playerId,
              },
            });
          }
        }

        for (const setData of matchData.sets) {
          const existingSet = match.sets.find((s) => s.setNumber === setData.setNumber);

          if (!existingSet) {
            await tx.set.create({
              data: {
                matchId: match.id,
                setNumber: setData.setNumber,
                teamAScore: setData.teamAScore,
                teamBScore: setData.teamBScore,
              },
            });
          } else {
            await tx.set.update({
              where: { id: existingSet.id },
              data: {
                teamAScore: setData.teamAScore,
                teamBScore: setData.teamBScore,
              },
            });
          }
        }
      }

      if (roundData.outcomes) {
        for (const outcome of roundData.outcomes) {
          await tx.roundOutcome.upsert({
            where: {
              roundId_userId: {
                roundId: round.id,
                userId: outcome.userId,
              },
            },
            create: {
              roundId: round.id,
              userId: outcome.userId,
              levelChange: outcome.levelChange,
            },
            update: {
              levelChange: outcome.levelChange,
            },
          });
        }
      }
    }

    if (data.finalOutcomes) {
      for (const outcome of data.finalOutcomes) {
        const user = await tx.user.findUnique({
          where: { id: outcome.userId },
        });

        if (!user) continue;

        const levelBefore = user.level;
        const reliabilityBefore = user.reliability;
        const levelAfter = levelBefore + outcome.levelChange;
        const reliabilityAfter = reliabilityBefore + outcome.reliabilityChange;

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
            levelChange: outcome.levelChange,
            reliabilityBefore,
            reliabilityAfter,
            reliabilityChange: outcome.reliabilityChange,
            pointsEarned: outcome.pointsEarned,
            position: outcome.position,
            isWinner: outcome.isWinner || false,
          },
          update: {
            levelBefore,
            levelAfter,
            levelChange: outcome.levelChange,
            reliabilityBefore,
            reliabilityAfter,
            reliabilityChange: outcome.reliabilityChange,
            pointsEarned: outcome.pointsEarned,
            position: outcome.position,
            isWinner: outcome.isWinner,
          },
        });

        if (game.affectsRating) {
          await tx.user.update({
            where: { id: outcome.userId },
            data: {
              level: levelAfter,
              reliability: reliabilityAfter,
              totalPoints: { increment: outcome.pointsEarned },
              gamesPlayed: { increment: 1 },
              gamesWon: { increment: outcome.isWinner ? 1 : 0 },
            },
          });
        }
      }

      await tx.game.update({
        where: { id: gameId },
        data: {
          hasResults: true,
          status: 'completed',
        },
      });
    }

    return await tx.game.findUnique({
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
                sets: true,
              },
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
                reliability: true,
              },
            },
          },
        },
      },
    });
  });
}

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
        orderBy: { roundNumber: 'asc' },
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

  const userParticipant = game.participants.find(
    (p) => p.userId === requestUserId && (p.role === ParticipantRole.OWNER || p.role === ParticipantRole.ADMIN)
  );

  if (!userParticipant) {
    throw new ApiError(403, 'Only game owners/admins can delete results');
  }

  await prisma.$transaction(async (tx) => {
    if (game.affectsRating && game.outcomes.length > 0) {
      for (const outcome of game.outcomes) {
        await tx.user.update({
          where: { id: outcome.userId },
          data: {
            level: outcome.levelBefore,
            reliability: outcome.reliabilityBefore,
            totalPoints: { decrement: outcome.pointsEarned },
            gamesPlayed: { decrement: 1 },
            gamesWon: { decrement: outcome.isWinner ? 1 : 0 },
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

    await tx.game.update({
      where: { id: gameId },
      data: {
        hasResults: false,
        status: 'scheduled',
      },
    });
  });
}

