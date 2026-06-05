import { LevelChangeEventType, Prisma, Sport } from '@prisma/client';
import {
  eventTypesForRevertScope,
  isSocialLevelRevertEventType,
  LevelChangeRevertScope,
} from './revertScope';

export async function revertForGame(
  gameId: string,
  scope: LevelChangeRevertScope,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const eventTypes = eventTypesForRevertScope(scope);
  const where =
    scope === 'all'
      ? { gameId }
      : { gameId, eventType: { in: eventTypes } };

  const events = await tx.levelChangeEvent.findMany({ where });

  for (const event of events) {
    if (isSocialLevelRevertEventType(event.eventType)) {
      await tx.user.update({
        where: { id: event.userId },
        data: { socialLevel: event.levelBefore },
      });
    }
  }

  await tx.levelChangeEvent.deleteMany({ where });
}

export async function clearSetEventsForUserInGame(
  gameId: string,
  userId: string,
  tx: Prisma.TransactionClient,
): Promise<void> {
  await tx.levelChangeEvent.deleteMany({
    where: {
      gameId,
      userId,
      eventType: LevelChangeEventType.SET,
    },
  });
}

export async function revertQuestionnaireEventsForUserSport(
  userId: string,
  sport: Sport,
  tx: Prisma.TransactionClient,
): Promise<void> {
  await tx.levelChangeEvent.deleteMany({
    where: {
      userId,
      sport,
      eventType: LevelChangeEventType.QUESTIONNAIRE,
      gameId: null,
    },
  });
}
