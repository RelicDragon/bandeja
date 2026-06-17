import { LeagueParticipantType, PlayoffFormat } from '@prisma/client';
import prisma from '../../config/database';
import { getUserNotesForGames } from '../userGameNote.service';
import { loadLeagueSeasonSportOrThrow } from '../../utils/validators/validateLeagueSeasonSport';
import {
  buildBracketGameSortMetaMap,
  sortBracketRoundGames,
} from './bracketScheduleListSort.util';
import {
  LEAGUE_USER_SELECT,
  projectLeagueParticipants,
  projectLeagueRounds,
} from './leagueSportProjection.util';

export class LeagueReadService {
  static async getLeagueRounds(leagueSeasonId: string, userId?: string) {
    const seasonSport = await loadLeagueSeasonSportOrThrow(leagueSeasonId);
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
                  select: LEAGUE_USER_SELECT,
                },
              },
            },
            fixedTeams: {
              include: {
                players: {
                  include: {
                    user: {
                      select: LEAGUE_USER_SELECT,
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
                roundType: true,
              },
            },
            outcomes: {
              include: {
                user: {
                  select: LEAGUE_USER_SELECT,
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

    const bracketRoundIds = rounds
      .filter((r) => r.playoffFormat === PlayoffFormat.BRACKET)
      .map((r) => r.id);
    if (bracketRoundIds.length > 0) {
      const slots = await prisma.leagueBracketSlot.findMany({
        where: { leagueRoundId: { in: bracketRoundIds }, gameId: { not: null } },
        select: { leagueRoundId: true, gameId: true, slotKind: true, roundIndex: true },
      });
      const metaByRound = new Map<string, ReturnType<typeof buildBracketGameSortMetaMap>>();
      for (const roundId of bracketRoundIds) {
        const roundSlots = slots.filter((s) => s.leagueRoundId === roundId);
        metaByRound.set(roundId, buildBracketGameSortMetaMap(roundSlots));
      }
      for (const round of rounds) {
        if (round.playoffFormat !== PlayoffFormat.BRACKET) continue;
        const meta = metaByRound.get(round.id);
        if (!meta || meta.size === 0) continue;
        round.games = sortBracketRoundGames(round.games, meta);
      }
    }

    // Fetch user notes if userId is provided
    if (userId && rounds.length > 0) {
      const allGameIds: string[] = [];
      rounds.forEach(round => {
        round.games.forEach(game => {
          allGameIds.push(game.id);
        });
      });

      if (allGameIds.length > 0) {
        const notesMap = await getUserNotesForGames(userId, allGameIds);

        // Attach userNote to each game
        return projectLeagueRounds(
          rounds.map((round) => ({
            ...round,
            games: round.games.map((game) => ({
              ...game,
              userNote: notesMap.get(game.id) || null,
            })),
          })),
          seasonSport,
        );
      }
    }

    return projectLeagueRounds(rounds, seasonSport);
  }

  static async getLeagueStandings(leagueSeasonId: string) {
    const seasonSport = await loadLeagueSeasonSportOrThrow(leagueSeasonId);
    const season = await prisma.leagueSeason.findUnique({
      where: { id: leagueSeasonId },
      select: { game: { select: { hasFixedTeams: true } } },
    });
    const hasFixedTeams = season?.game?.hasFixedTeams ?? false;

    const participants = await prisma.leagueParticipant.findMany({
      where: { leagueSeasonId },
      include: {
        user: {
          select: LEAGUE_USER_SELECT,
        },
        leagueTeam: {
          include: {
            players: {
              include: {
                user: {
                  select: LEAGUE_USER_SELECT,
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

    const wantType = hasFixedTeams ? LeagueParticipantType.TEAM : LeagueParticipantType.USER;
    return projectLeagueParticipants(
      participants.filter((p) => p.participantType === wantType),
      seasonSport,
    );
  }
}

