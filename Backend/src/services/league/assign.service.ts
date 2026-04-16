import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { ParticipantRole } from '@prisma/client';
import { hasParentGamePermission } from '../../utils/parentGamePermissions';
import { fetchGameWithPlayingParticipants } from '../../utils/gameQueries';
import { validateGameCanAcceptParticipants } from '../../utils/participantValidation';
import { addOrUpdateParticipant } from '../../utils/participantOperations';
import { performPostJoinOperations } from '../../utils/postJoinOperations';
import notificationService from '../notification.service';

export class LeagueAssignService {
  static async getLeagueSeasonParticipantUserIds(leagueSeasonId: string): Promise<Set<string>> {
    const participants = await prisma.leagueParticipant.findMany({
      where: { leagueSeasonId },
      select: {
        userId: true,
        leagueTeam: { select: { players: { select: { userId: true } } } },
      },
    });
    const ids = new Set<string>();
    for (const p of participants) {
      if (p.userId) ids.add(p.userId);
      for (const pl of p.leagueTeam?.players ?? []) {
        ids.add(pl.userId);
      }
    }
    return ids;
  }

  static async assignLeagueParticipants(
    gameId: string,
    callerUserId: string,
    playerIds: string[],
    isAdmin: boolean
  ): Promise<void> {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true, entityType: true, parentId: true },
    });
    if (!game) throw new ApiError(404, 'errors.league.gameNotFound');
    if (playerIds.length === 0) {
      throw new ApiError(400, 'errors.league.playerIdsRequired');
    }
    if (game.entityType !== 'LEAGUE' || !game.parentId) {
      throw new ApiError(400, 'errors.league.onlyLeagueRound');
    }
    const hasPermission = await hasParentGamePermission(
      gameId,
      callerUserId,
      [ParticipantRole.OWNER, ParticipantRole.ADMIN],
      isAdmin
    );
    if (!hasPermission) {
      throw new ApiError(403, 'errors.league.onlySeasonOwnerAdmin');
    }
    const allowedUserIds = await this.getLeagueSeasonParticipantUserIds(game.parentId);
    const invalid = playerIds.filter((id) => !allowedUserIds.has(id));
    if (invalid.length > 0) {
      throw new ApiError(400, 'errors.league.mustBeSeasonParticipants');
    }
    const uniqueIds = [...new Set(playerIds)];
    const gameWithParticipants = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        id: true,
        status: true,
        maxParticipants: true,
        court: { select: { id: true, name: true, club: { select: { id: true, name: true, avatar: true } } } },
        club: { select: { id: true, name: true, avatar: true } },
        participants: { where: { status: 'PLAYING' }, select: { userId: true } },
      },
    });
    if (!gameWithParticipants) throw new ApiError(404, 'errors.league.gameNotFound');
    const maxPlayers = gameWithParticipants.maxParticipants ?? 4;
    if (uniqueIds.length > maxPlayers) {
      throw new ApiError(400, 'errors.league.tooManyPlayers');
    }
    validateGameCanAcceptParticipants(gameWithParticipants);
    for (const userId of uniqueIds) {
      await prisma.$transaction(async (tx: any) => {
        const currentGame = await fetchGameWithPlayingParticipants(tx, gameId);
        validateGameCanAcceptParticipants(currentGame);
        await addOrUpdateParticipant(tx, gameId, userId, { role: ParticipantRole.PARTICIPANT });
      });
      await performPostJoinOperations(gameId, userId);
      const gameForNotif = await prisma.game.findUnique({
        where: { id: gameId },
        select: {
          id: true,
          startTime: true,
          endTime: true,
          court: { select: { id: true, name: true, club: { select: { id: true, name: true, avatar: true } } } },
          club: { select: { id: true, name: true, avatar: true } },
        },
      });
      if (gameForNotif?.startTime && gameForNotif?.endTime) {
        try {
          await notificationService.sendLeagueGameAssignedNotification(
            gameForNotif as any,
            userId
          );
        } catch (err) {
          console.error(`[LeagueAssign] Failed to send assigned notification to user ${userId}:`, err);
        }
      }
    }
    const socketService = (global as any).socketService;
    if (socketService) {
      for (const userId of uniqueIds) {
        socketService.emitGameUpdate(gameId, userId);
      }
    }
  }
}
