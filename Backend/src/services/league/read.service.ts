import prisma from '../../config/database';
import { USER_SELECT_FIELDS } from '../../utils/constants';

export class LeagueReadService {
  static async getLeagueRounds(leagueSeasonId: string) {
    const rounds = await prisma.leagueRound.findMany({
      where: { leagueSeasonId },
      include: {
        games: {
          include: {
            club: {
              include: {
                courts: true,
                city: {
                  select: {
                    name: true,
                  },
                },
              },
            },
            court: {
              include: {
                club: true,
              },
            },
            participants: {
              include: {
                user: {
                  select: USER_SELECT_FIELDS,
                },
              },
            },
            fixedTeams: {
              include: {
                players: {
                  include: {
                    user: {
                      select: USER_SELECT_FIELDS,
                    },
                  },
                },
              },
              orderBy: { teamNumber: 'asc' },
            },
            gameCourts: {
              include: {
                court: {
                  include: {
                    club: true,
                  },
                },
              },
              orderBy: { order: 'asc' },
            },
            leagueSeason: {
              include: {
                league: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                game: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
            leagueGroup: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
            leagueRound: {
              select: {
                id: true,
                orderIndex: true,
              },
            },
            outcomes: {
              include: {
                user: {
                  select: USER_SELECT_FIELDS,
                },
              },
              orderBy: { position: 'asc' },
            },
            parent: {
              include: {
                leagueSeason: {
                  include: {
                    league: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                    game: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: { startTime: 'asc' },
        },
      },
      orderBy: { orderIndex: 'asc' },
    });

    return rounds;
  }

  static async getLeagueStandings(leagueSeasonId: string) {
    const participants = await prisma.leagueParticipant.findMany({
      where: { leagueSeasonId },
      include: {
        user: {
          select: USER_SELECT_FIELDS,
        },
        leagueTeam: {
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
        currentGroup: {
          select: {
            id: true,
            name: true,
            betterGroupId: true,
            worseGroupId: true,
            color: true,
          },
        },
      },
      orderBy: [
        { points: 'desc' },
        { wins: 'desc' },
        { scoreDelta: 'desc' },
      ],
    });

    return participants;
  }
}

