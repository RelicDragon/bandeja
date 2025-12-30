import { Prisma, LevelChangeEventType, EntityType, ParticipantRole } from '@prisma/client';
import {
  SOCIAL_PARTICIPANT_LEVEL,
  ROLE_MULTIPLIERS,
} from './socialLevelConstants';

export class SocialParticipantLevelService {
  static async applySocialParticipantLevelChanges(
    gameId: string,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    const game = await tx.game.findUnique({
      where: { id: gameId },
      select: {
        id: true,
        entityType: true,
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

    if (!game) {
      return;
    }

    if (game.entityType === EntityType.BAR || game.entityType === EntityType.LEAGUE_SEASON) {
      return;
    }

    const playingParticipants = game.participants.filter(p => p.isPlaying);
    if (playingParticipants.length < 2) {
      return;
    }

    const allParticipants = game.participants;
    const parentGameParticipants = game.parentId
      ? await tx.gameParticipant.findMany({
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

    for (const participant of allParticipants) {
      const isPlaying = participant.isPlaying;
      let baseSocialLevelBoost = 0.0;

      // Calculate base boost for ALL participants based on playing participants
      // This ensures non-playing owners/admins still get a base boost
      for (const otherParticipant of playingParticipants) {
        if (otherParticipant.userId === participant.userId) {
          continue;
        }

        const numberOfPlayedGames = await this.countCoPlayedGames(
          participant.userId,
          otherParticipant.userId,
          game.id,
          game.startTime,
          tx
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

      const socialLevelBoost = baseSocialLevelBoost * multiplier;

      if (socialLevelBoost > 0) {
        const user = await tx.user.findUnique({
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

        await tx.user.update({
          where: { id: participant.userId },
          data: {
            socialLevel: levelAfter,
          },
        });

        await tx.levelChangeEvent.create({
          data: {
            userId: participant.userId,
            levelBefore,
            levelAfter,
            eventType: LevelChangeEventType.SOCIAL_PARTICIPANT,
            linkEntityType: EntityType.GAME,
            gameId: gameId,
          },
        });
      }
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

  static async revertSocialParticipantLevelChanges(
    gameId: string,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    const events = await tx.levelChangeEvent.findMany({
      where: {
        gameId: gameId,
        eventType: LevelChangeEventType.SOCIAL_PARTICIPANT,
      },
    });

    for (const event of events) {
      await tx.user.update({
        where: { id: event.userId },
        data: {
          socialLevel: event.levelBefore,
        },
      });
    }

    await tx.levelChangeEvent.deleteMany({
      where: {
        gameId: gameId,
        eventType: LevelChangeEventType.SOCIAL_PARTICIPANT,
      },
    });
  }

  private static async countCoPlayedGames(
    userId1: string,
    userId2: string,
    currentGameId: string,
    currentGameStartTime: Date,
    tx: Prisma.TransactionClient
  ): Promise<number> {
    const games = await tx.game.findMany({
      where: {
        id: { not: currentGameId },
        startTime: { lt: currentGameStartTime },
        entityType: { notIn: [EntityType.BAR, EntityType.LEAGUE_SEASON] },
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

