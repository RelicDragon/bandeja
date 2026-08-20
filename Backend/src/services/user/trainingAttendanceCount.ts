import { EntityType, ParticipantStatus, Prisma } from '@prisma/client';

export type TrainingAttendanceRow = {
  status: ParticipantStatus;
  game: {
    entityType: EntityType;
    trainerId: string | null;
  };
};

export function countsAsTrainingAttendance(row: TrainingAttendanceRow): boolean {
  return row.status === ParticipantStatus.PLAYING && row.game.entityType === EntityType.TRAINING;
}

export function trainingAttendanceWhere(userId: string): Prisma.GameParticipantWhereInput {
  return {
    userId,
    status: ParticipantStatus.PLAYING,
    game: { entityType: EntityType.TRAINING },
  };
}

type TrainingAttendanceDb = {
  gameParticipant: {
    count: (args: { where: Prisma.GameParticipantWhereInput }) => Promise<number>;
  };
};

export async function countTrainingAttendance(
  db: TrainingAttendanceDb,
  userId: string,
): Promise<number> {
  return db.gameParticipant.count({ where: trainingAttendanceWhere(userId) });
}
