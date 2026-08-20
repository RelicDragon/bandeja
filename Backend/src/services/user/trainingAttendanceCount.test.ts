import assert from 'node:assert/strict';
import { EntityType, ParticipantStatus, type Prisma } from '@prisma/client';
import {
  countsAsTrainingAttendance,
  countTrainingAttendance,
  trainingAttendanceWhere,
  type TrainingAttendanceRow,
} from './trainingAttendanceCount';

function row(
  status: ParticipantStatus,
  entityType: EntityType,
  trainerId: string | null = null,
): TrainingAttendanceRow {
  return { status, game: { entityType, trainerId } };
}

assert.equal(
  countsAsTrainingAttendance(row(ParticipantStatus.PLAYING, EntityType.TRAINING)),
  true,
  'PLAYING on TRAINING counts',
);

assert.equal(
  countsAsTrainingAttendance(row(ParticipantStatus.PLAYING, EntityType.TRAINING, 'user-1')),
  true,
  'PLAYING participant still counts when they are also trainerId',
);

assert.equal(
  countsAsTrainingAttendance(row(ParticipantStatus.NON_PLAYING, EntityType.TRAINING, 'user-1')),
  false,
  'trainer-only NON_PLAYING does not count',
);

assert.equal(
  countsAsTrainingAttendance(row(ParticipantStatus.PLAYING, EntityType.GAME)),
  false,
  'PLAYING on GAME does not count',
);

assert.equal(
  countsAsTrainingAttendance(row(ParticipantStatus.PLAYING, EntityType.TOURNAMENT)),
  false,
  'PLAYING on TOURNAMENT does not count',
);

assert.equal(
  countsAsTrainingAttendance(row(ParticipantStatus.INVITED, EntityType.TRAINING)),
  false,
  'INVITED on TRAINING does not count',
);

assert.equal(
  countsAsTrainingAttendance(row(ParticipantStatus.IN_QUEUE, EntityType.TRAINING)),
  false,
  'IN_QUEUE on TRAINING does not count',
);

assert.equal(
  countsAsTrainingAttendance(row(ParticipantStatus.GUEST, EntityType.TRAINING)),
  false,
  'GUEST on TRAINING does not count',
);

const where = trainingAttendanceWhere('user-1');
assert.equal(where.userId, 'user-1');
assert.equal(where.status, ParticipantStatus.PLAYING);
assert.deepEqual(where.game, { entityType: EntityType.TRAINING });
assert.equal('trainerId' in (where.game as object), false);

void (async () => {
  let lastWhere: unknown;
  const db = {
    gameParticipant: {
      count: async (args: { where: Prisma.GameParticipantWhereInput }) => {
        lastWhere = args.where;
        return 0;
      },
    },
  };

  const n = await countTrainingAttendance(db, 'user-1');
  assert.equal(n, 0, 'empty/zero is a valid count');
  assert.deepEqual(lastWhere, trainingAttendanceWhere('user-1'));

  console.log('trainingAttendanceCount.test: ok');
})().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
