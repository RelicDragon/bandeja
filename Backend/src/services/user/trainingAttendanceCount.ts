import { EntityType, GameStatus, ParticipantStatus, Prisma, Sport } from '@prisma/client';

export type TrainingAttendanceRow = {
  status: ParticipantStatus;
  game: {
    entityType: EntityType;
    trainerId: string | null;
    sport: Sport;
    startTime: Date;
    status: GameStatus;
  };
};

export type TrainingAttendanceOptions = {
  sport?: Sport;
  now?: Date;
};

function hasStartedOrFinished(row: TrainingAttendanceRow, now: Date): boolean {
  if (row.game.startTime.getTime() <= now.getTime()) return true;
  return row.game.status === GameStatus.FINISHED || row.game.status === GameStatus.ARCHIVED;
}

export function countsAsTrainingAttendance(
  row: TrainingAttendanceRow,
  options?: TrainingAttendanceOptions,
): boolean {
  if (row.status !== ParticipantStatus.PLAYING) return false;
  if (row.game.entityType !== EntityType.TRAINING) return false;
  if (options?.sport && row.game.sport !== options.sport) return false;
  return hasStartedOrFinished(row, options?.now ?? new Date());
}

export function trainingAttendanceWhere(
  userId: string,
  options?: TrainingAttendanceOptions,
): Prisma.GameParticipantWhereInput {
  const now = options?.now ?? new Date();
  return {
    userId,
    status: ParticipantStatus.PLAYING,
    game: {
      entityType: EntityType.TRAINING,
      ...(options?.sport ? { sport: options.sport } : {}),
      OR: [
        { startTime: { lte: now } },
        { status: { in: [GameStatus.FINISHED, GameStatus.ARCHIVED] } },
      ],
    },
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
  options?: TrainingAttendanceOptions,
): Promise<number> {
  return db.gameParticipant.count({ where: trainingAttendanceWhere(userId, options) });
}
