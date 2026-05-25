import prisma from '../../config/database';
import notificationService from '../notification.service';
import { shouldSendBracketGameAssignedNotification } from './bracketGameNotificationPolicy';

export class BracketGameNotificationService {
  static notifyCreatedGames(gameIds: string[]): void {
    const unique = [...new Set(gameIds.filter((id) => typeof id === 'string' && id.length > 0))];
    for (const gameId of unique) {
      void this.notifyGameParticipants(gameId).catch((err) =>
        console.error(`[BracketNotify] Failed for game ${gameId}:`, err)
      );
    }
  }

  private static async notifyGameParticipants(gameId: string): Promise<void> {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        id: true,
        sport: true,
        startTime: true,
        endTime: true,
        timeIsSet: true,
        parentId: true,
        leagueGroupId: true,
        leagueRound: {
          select: { id: true, playoffFormat: true, bracketScope: true },
        },
        participants: {
          where: { status: 'PLAYING' },
          select: { userId: true },
        },
        fixedTeams: {
          include: { players: { select: { userId: true } } },
        },
        court: {
          select: {
            id: true,
            name: true,
            club: { select: { id: true, name: true, avatar: true } },
          },
        },
        club: { select: { id: true, name: true, avatar: true } },
      },
    });

    if (!game || !shouldSendBracketGameAssignedNotification(game)) return;

    const userIds = new Set<string>();
    for (const p of game.participants) {
      userIds.add(p.userId);
    }
    for (const team of game.fixedTeams) {
      for (const pl of team.players) {
        userIds.add(pl.userId);
      }
    }

    for (const userId of userIds) {
      try {
        await notificationService.sendLeagueGameAssignedNotification(game, userId);
      } catch (err) {
        console.error(`[BracketNotify] Failed for user ${userId} on game ${gameId}:`, err);
      }
    }
  }
}
