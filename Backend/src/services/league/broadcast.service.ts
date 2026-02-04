import prisma from '../../config/database';
import { ParticipantRole } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { hasParentGamePermission } from '../../utils/parentGamePermissions';
import notificationService from '../notification.service';
import { NotificationPreferenceService } from '../notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';
import { PreferenceKey } from '../../types/notifications.types';

export class LeagueBroadcastService {
  static async broadcastRoundStartMessage(leagueRoundId: string, userId: string, isAdmin: boolean = false) {
    console.log(`📢 Starting broadcast round start message for league round ${leagueRoundId} by user ${userId}`);
    
    const round = await prisma.leagueRound.findUnique({
      where: { id: leagueRoundId },
      include: {
        leagueSeason: {
          include: {
            league: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        games: {
          include: {
            participants: {
              where: { status: 'PLAYING' },
              include: {
                user: {
                  select: {
                    ...USER_SELECT_FIELDS,
                    telegramId: true,
                    language: true,
                    currentCityId: true,
                  },
                },
              },
            },
            fixedTeams: {
              include: {
                players: {
                  include: {
                    user: {
                      select: {
                        ...USER_SELECT_FIELDS,
                        telegramId: true,
                        language: true,
                        currentCityId: true,
                      },
                    },
                  },
                },
              },
            },
            court: {
              include: {
                club: true,
              },
            },
            club: true,
            leagueSeason: {
              include: {
                league: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
            leagueRound: {
              select: {
                id: true,
                orderIndex: true,
              },
            },
          },
        },
      },
    });

    if (!round) {
      throw new ApiError(404, 'League round not found');
    }

    if (!round.leagueSeason) {
      throw new ApiError(404, 'League season not found');
    }

    if (!isAdmin) {
      const hasPermission = await hasParentGamePermission(round.leagueSeasonId, userId, [ParticipantRole.OWNER, ParticipantRole.ADMIN], isAdmin);

      if (!hasPermission) {
        throw new ApiError(403, 'Only owners and admins can send round start messages');
      }
    }

    if (round.sentStartMessage) {
      throw new ApiError(400, 'Start message already sent for this round');
    }

    const notifiedUserIds = new Set<string>();

    for (const game of round.games) {
      const gameWithContext = {
        ...game,
        leagueSeason: round.leagueSeason,
        leagueRound: {
          id: round.id,
          orderIndex: round.orderIndex,
        },
      };

      const participants = game.participants
        .filter(p => p.status === 'PLAYING' && p.user)
        .map(p => p.user);

      const fixedTeamPlayers = game.hasFixedTeams
        ? game.fixedTeams.flatMap(team =>
            team.players
              .filter(p => p.user)
              .map(p => p.user)
          )
        : [];

      const allUsers = [...participants, ...fixedTeamPlayers];

      for (const user of allUsers) {
        if (!user || notifiedUserIds.has(user.id)) {
          continue;
        }

        notifiedUserIds.add(user.id);

        const userName = user.firstName && user.lastName 
          ? `${user.firstName} ${user.lastName}` 
          : user.firstName || user.lastName || user.id;

        try {
          await notificationService.sendLeagueRoundStartNotification(gameWithContext, user);
          const [allowTelegram, allowPush] = await Promise.all([
            NotificationPreferenceService.doesUserAllow(user.id, NotificationChannelType.TELEGRAM, PreferenceKey.SEND_MESSAGES),
            NotificationPreferenceService.doesUserAllow(user.id, NotificationChannelType.PUSH, PreferenceKey.SEND_MESSAGES),
          ]);
          const notificationTypes: string[] = [];
          if (allowTelegram) notificationTypes.push('Telegram');
          if (allowPush) notificationTypes.push('Push');

          if (notificationTypes.length > 0) {
            console.log(`  ✅ Sent ${notificationTypes.join(' + ')} notification to ${userName} (${user.id})`);
          } else {
            console.log(`  ⚠️  User ${userName} (${user.id}) has notifications disabled`);
          }
        } catch (error) {
          console.error(`  ❌ Failed to send notification to ${userName} (${user.id}):`, error);
        }
      }
    }

    await prisma.leagueRound.update({
      where: { id: leagueRoundId },
      data: { sentStartMessage: true },
    });

    console.log(`✅ Broadcast round start message completed for league round ${leagueRoundId}. Notified ${notifiedUserIds.size} users`);

    return { success: true, notifiedUsers: notifiedUserIds.size };
  }
}

