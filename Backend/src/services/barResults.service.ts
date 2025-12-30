import prisma from '../config/database';
import { Prisma, LevelChangeEventType, EntityType } from '@prisma/client';
import { BAR_SOCIAL_LEVEL } from './socialLevelConstants';

export class BarResultsService {
  static async setBarResults(gameId: string, tx?: Prisma.TransactionClient): Promise<void> {
    const executeInTransaction = async (client: Prisma.TransactionClient | typeof prisma) => {
      const game = await client.game.findUnique({
        where: { id: gameId },
        select: {
          id: true,
          entityType: true,
          resultsStatus: true,
          participants: {
            where: { isPlaying: true },
            select: {
              userId: true,
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

      const playingParticipants = game.participants;
      const numberOfParticipants = playingParticipants.length;

      if (numberOfParticipants === 0) {
        await client.game.update({
          where: { id: gameId },
          data: { resultsStatus: 'NONE' },
        });
        return;
      }

      const socialLevelIncrement =
        BAR_SOCIAL_LEVEL.INCREMENT_PER_PARTICIPANT * numberOfParticipants;

      for (const participant of playingParticipants) {
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
        const levelAfter = levelBefore + socialLevelIncrement;

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
}

