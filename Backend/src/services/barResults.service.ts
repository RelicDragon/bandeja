import prisma from '../config/database';
import { Prisma, LevelChangeEventType, EntityType, ParticipantRole } from '@prisma/client';
import {
  SOCIAL_PARTICIPANT_LEVEL,
  ROLE_MULTIPLIERS,
} from './socialLevelConstants';

export class BarResultsService {
  static async setBarResults(gameId: string, tx?: Prisma.TransactionClient): Promise<void> {
    const executeInTransaction = async (client: Prisma.TransactionClient | typeof prisma) => {
      const game = await client.game.findUnique({
        where: { id: gameId },
        select: {
          id: true,
          entityType: true,
          resultsStatus: true,
          startTime: true,
          parentId: true,
          participants: {
            select: {
              userId: true,
              role: true,
              isPlaying: true,
            },
          },
        },
      });

      if (!game || game.entityType !== EntityType.BAR) {
        return;
      }

      if (game.resultsStatus !== 'NONE') {
        return;
      }

      const updatedGame = await client.game.updateMany({
        where: {
          id: gameId,
          entityType: EntityType.BAR,
          resultsStatus: 'NONE',
        },
        data: {
          resultsStatus: 'IN_PROGRESS',
        },
      });

      if (updatedGame.count === 0) {
        return;
      }

      const playingParticipants = game.participants.filter(p => p.isPlaying);
      if (playingParticipants.length < 2) {
        await client.game.update({
          where: { id: gameId },
          data: { resultsStatus: 'NONE' },
        });
        return;
      }

      const allParticipants = game.participants;
      const parentGameParticipants = game.parentId
        ? await client.gameParticipant.findMany({
            where: {
              gameId: game.parentId,
              userId: { in: allParticipants.map(p => p.userId) },
            },
            select: {
              userId: true,
              role: true,
            },
          })
        : [];

      const parentParticipantMap = new Map(
        parentGameParticipants.map(p => [p.userId, p.role])
      );

      if (!game.startTime) {
        await client.game.update({
          where: { id: gameId },
          data: { resultsStatus: 'NONE' },
        });
        return;
      }

      for (const participant of allParticipants) {
        const isPlaying = participant.isPlaying;
        let baseSocialLevelBoost = 0.0;

        for (const otherParticipant of playingParticipants) {
          if (otherParticipant.userId === participant.userId) {
            continue;
          }

          const numberOfPlayedGames = await this.countCoPlayedGames(
            participant.userId,
            otherParticipant.userId,
            game.id,
            game.startTime,
            client
          );

          const boost =
            SOCIAL_PARTICIPANT_LEVEL.MAX_BOOST_PER_RELATIONSHIP -
            Math.min(
              SOCIAL_PARTICIPANT_LEVEL.MAX_GAMES_FOR_REDUCTION,
              numberOfPlayedGames
            ) *
              SOCIAL_PARTICIPANT_LEVEL.REDUCTION_PER_GAME;
          baseSocialLevelBoost += boost;
        }

        const multiplier = this.getRoleMultiplier(
          participant.role,
          parentParticipantMap.get(participant.userId),
          isPlaying
        );

        const socialLevelBoost = baseSocialLevelBoost * multiplier * 2;

        if (socialLevelBoost > 0) {
          const user = await client.user.findUnique({
            where: { id: participant.userId },
            select: {
              id: true,
              socialLevel: true,
            },
          });

          if (!user) {
            continue;
          }

          const levelBefore = user.socialLevel;
          const levelAfter = levelBefore + socialLevelBoost;

          await client.user.update({
            where: { id: participant.userId },
            data: {
              socialLevel: levelAfter,
            },
          });

          await client.levelChangeEvent.create({
            data: {
              userId: participant.userId,
              levelBefore,
              levelAfter,
              eventType: LevelChangeEventType.SOCIAL_BAR,
              linkEntityType: EntityType.BAR,
              gameId: gameId,
            },
          });
        }
      }

      await client.game.update({
        where: { id: gameId },
        data: {
          resultsStatus: 'FINAL',
        },
      });
    };

    if (tx) {
      await executeInTransaction(tx);
    } else {
      await prisma.$transaction(executeInTransaction);
    }
  }

  private static getRoleMultiplier(
    currentRole: ParticipantRole,
    parentRole: ParticipantRole | undefined,
    isPlaying: boolean
  ): number {
    if (currentRole === ParticipantRole.OWNER) {
      return isPlaying
        ? ROLE_MULTIPLIERS.OWNER.PLAYED
        : ROLE_MULTIPLIERS.OWNER.NOT_PLAYED;
    }

    if (parentRole === ParticipantRole.OWNER) {
      return isPlaying
        ? ROLE_MULTIPLIERS.PARENT_OWNER.PLAYED
        : ROLE_MULTIPLIERS.PARENT_OWNER.NOT_PLAYED;
    }

    if (currentRole === ParticipantRole.ADMIN) {
      return isPlaying
        ? ROLE_MULTIPLIERS.ADMIN.PLAYED
        : ROLE_MULTIPLIERS.ADMIN.NOT_PLAYED;
    }

    if (parentRole === ParticipantRole.ADMIN) {
      return isPlaying
        ? ROLE_MULTIPLIERS.PARENT_ADMIN.PLAYED
        : ROLE_MULTIPLIERS.PARENT_ADMIN.NOT_PLAYED;
    }

    return isPlaying
      ? ROLE_MULTIPLIERS.PARTICIPANT.PLAYED
      : ROLE_MULTIPLIERS.PARTICIPANT.NOT_PLAYED;
  }

  private static async countCoPlayedGames(
    userId1: string,
    userId2: string,
    currentGameId: string,
    currentGameStartTime: Date,
    client: Prisma.TransactionClient | typeof prisma
  ): Promise<number> {
    const games = await client.game.findMany({
      where: {
        id: { not: currentGameId },
        startTime: { lt: currentGameStartTime },
        resultsStatus: 'FINAL',
        entityType: { notIn: [EntityType.LEAGUE_SEASON] },
        AND: [
          { participants: { some: { userId: userId1, isPlaying: true } } },
          { participants: { some: { userId: userId2, isPlaying: true } } },
        ],
      },
      select: { id: true },
    });

    return games.length;
  }
}

