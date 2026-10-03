import prisma from '../config/database';
import { Prisma, Sport } from '@prisma/client';
import { ApiError } from '../utils/ApiError';
import { GameService } from './game/game.service';
import { USER_SELECT_WITH_SPORT_PROFILES } from '../utils/constants';
import { LeagueSyncService } from './league/sync.service';
import { EntityType } from '@prisma/client';
import { fixedTeamSlotLimit, hasOpenEndedFixedTeams, maxFixedTeamSlots } from '../shared/matchFormat';
import { projectUserForSportContext } from './user/userSportProfile.service';

const FIXED_TEAM_PLAYER_USER_SELECT = USER_SELECT_WITH_SPORT_PROFILES;

function projectFixedTeamsForSport<T extends { players: Array<{ user: unknown }> }>(
  teams: T[],
  sport: Sport,
): T[] {
  return teams.map((team) => ({
    ...team,
    players: team.players.map((player) => ({
      ...player,
      user: projectUserForSportContext(player.user as Parameters<typeof projectUserForSportContext>[0], sport),
    })),
  }));
}

function projectGameUsersForSportContext<T extends { sport?: Sport; participants?: any[]; fixedTeams?: any[] }>(
  game: T,
): T {
  const sport = game.sport ?? Sport.PADEL;
  return {
    ...game,
    participants: (game.participants ?? []).map((p) => ({
      ...p,
      user: projectUserForSportContext(p.user, sport),
    })),
    fixedTeams: projectFixedTeamsForSport(game.fixedTeams ?? [], sport),
  };
}

interface GameTeamData {
  teamNumber: number;
  name?: string;
  playerIds: string[];
}

async function syncLeagueSeasonAfterFixedTeamsChange(gameId: string) {
  const row = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      entityType: true,
      leagueRound: { select: { leagueSeasonId: true } },
    },
  });
  if (!row) return;
  if (row.entityType === EntityType.LEAGUE_SEASON) {
    await LeagueSyncService.syncLeagueParticipants(gameId);
    return;
  }
  const leagueSeasonId = row.leagueRound?.leagueSeasonId;
  if (leagueSeasonId) {
    await LeagueSyncService.syncLeagueParticipants(leagueSeasonId);
  }
}

export class GameTeamService {
  /**
   * `openEndedList`: caller sent the complete team list. Store builds that predate open-ended
   * league teams only know slots 1..maxFixedTeamSlots, so without it the extra teams are kept.
   */
  static async setGameTeams(gameId: string, teams: GameTeamData[], opts: { openEndedList?: boolean } = {}) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT id FROM "Game" WHERE id = ${gameId} FOR UPDATE`);

      const game = await tx.game.findUnique({
        where: { id: gameId },
        include: {
          participants: true,
          rounds: true,
        },
      });

      if (!game) {
        throw new ApiError(404, 'Game not found');
      }

      if (game.rounds.length > 0) {
        throw new ApiError(400, 'Cannot set fixed pairs after game has started');
      }

      const slotLimit = fixedTeamSlotLimit(game);
      if (slotLimit < 1) {
        throw new ApiError(400, 'Game must allow at least one fixed pair');
      }
      const openEnded = hasOpenEndedFixedTeams(game);

      const accepted = (Array.isArray(teams) ? teams : [])
        .filter((t) => typeof t.teamNumber === 'number' && Number.isFinite(t.teamNumber) && t.teamNumber >= 1)
        .sort((a, b) => a.teamNumber - b.teamNumber);
      if (openEnded && !opts.openEndedList) {
        const legacyCount = maxFixedTeamSlots(game);
        const kept = await tx.gameTeam.findMany({
          where: { gameId, teamNumber: { gt: legacyCount } },
          include: { players: { select: { userId: true } } },
          orderBy: { teamNumber: 'asc' },
        });
        accepted.splice(
          0,
          accepted.length,
          ...accepted.filter((t) => t.teamNumber <= legacyCount),
          ...kept.map((t) => ({
            teamNumber: t.teamNumber,
            name: t.name ?? undefined,
            playerIds: t.players.map((p) => p.userId),
          })),
        );
      }
      if (openEnded && accepted.length > slotLimit) {
        throw new ApiError(400, `At most ${slotLimit} fixed teams are allowed`);
      }

      // Open-ended lists store exactly the submitted teams, renumbered 1..k; fixed lists keep every slot.
      const byNumber = new Map<number, string[]>();
      const nameByNumber = new Map<number, string | undefined>();
      accepted.forEach((t, index) => {
        const n = openEnded ? index + 1 : t.teamNumber;
        if (n > slotLimit) return;
        const ids = Array.isArray(t.playerIds) ? t.playerIds.filter((id) => typeof id === 'string' && id.length > 0) : [];
        byNumber.set(n, ids);
        if (t.name !== undefined) {
          nameByNumber.set(n, t.name);
        }
      });
      const slotCount = openEnded ? byNumber.size : slotLimit;

      const allPlayerIds = [...byNumber.values()].flat();
      const uniquePlayerIds = new Set(allPlayerIds);

      for (let teamNumber = 1; teamNumber <= slotCount; teamNumber++) {
        const ids = byNumber.get(teamNumber) ?? [];
        if (ids.length !== new Set(ids).size) {
          throw new ApiError(400, 'A player cannot appear twice on the same team');
        }
      }

      if (!game.allowUserInMultipleTeams && allPlayerIds.length !== uniquePlayerIds.size) {
        throw new ApiError(400, 'A player cannot be in multiple teams');
      }

      if (game.allowUserInMultipleTeams) {
        const rosterKeys: string[] = [];
        for (let teamNumber = 1; teamNumber <= slotCount; teamNumber++) {
          const ids = [...(byNumber.get(teamNumber) ?? [])].sort();
          if (ids.length === 0) {
            continue;
          }
          rosterKeys.push(ids.join(':'));
        }
        if (rosterKeys.length !== new Set(rosterKeys).size) {
          throw new ApiError(400, 'Two fixed teams cannot have identical rosters');
        }
      }

      for (const playerId of uniquePlayerIds) {
        const isParticipant = game.participants.some((p) => p.userId === playerId);
        if (!isParticipant) {
          throw new ApiError(400, `Player ${playerId} is not a participant in this game`);
        }
      }

      await tx.gameTeam.deleteMany({
        where: { gameId },
      });

      for (let teamNumber = 1; teamNumber <= slotCount; teamNumber++) {
        const playerIds = byNumber.get(teamNumber) ?? [];
        await tx.gameTeam.create({
          data: {
            gameId,
            teamNumber,
            name: nameByNumber.get(teamNumber),
            players: {
              create: playerIds.map((userId) => ({ userId })),
            },
          },
        });
      }

      await tx.game.update({
        where: { id: gameId },
        data: { hasFixedTeams: true },
      });
    });

    await GameService.updateGameReadiness(gameId);
    await syncLeagueSeasonAfterFixedTeamsChange(gameId);

    const updatedGame = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        participants: {
          include: {
            user: {
              select: USER_SELECT_WITH_SPORT_PROFILES,
            },
          },
        },
        club: true,
        court: true,
        fixedTeams: {
          include: {
            players: {
              include: {
                user: {
                  select: FIXED_TEAM_PLAYER_USER_SELECT,
                },
              },
            },
          },
          orderBy: { teamNumber: 'asc' },
        },
      },
    });

    return updatedGame ? projectGameUsersForSportContext(updatedGame) : updatedGame;
  }

  static async getGameTeams(gameId: string) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true, hasFixedTeams: true, sport: true },
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    if (!game.hasFixedTeams) {
      return [];
    }

    const teams = await prisma.gameTeam.findMany({
      where: { gameId },
      include: {
        players: {
          include: {
            user: {
              select: FIXED_TEAM_PLAYER_USER_SELECT,
            },
          },
        },
      },
      orderBy: { teamNumber: 'asc' },
    });

    return projectFixedTeamsForSport(teams, game.sport ?? Sport.PADEL);
  }

  static async deleteGameTeams(gameId: string) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        participants: true,
        rounds: true,
      },
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    if (game.rounds.length > 0) {
      throw new ApiError(400, 'Cannot delete fixed pairs after game has started');
    }

    await prisma.$transaction(async (tx) => {
      await tx.gameTeam.deleteMany({
        where: { gameId },
      });

      await tx.game.update({
        where: { id: gameId },
        data: { hasFixedTeams: false },
      });
    });

    await GameService.updateGameReadiness(gameId);
    await syncLeagueSeasonAfterFixedTeamsChange(gameId);
  }
}

