import assert from 'node:assert/strict';
import { EntityType, GameStatus, ParticipantStatus, Sport, type Prisma } from '@prisma/client';
import {
  countsAsTrainingAttendance,
  countTrainingAttendance,
  trainingAttendanceWhere,
  type TrainingAttendanceRow,
} from './trainingAttendanceCount';

const NOW = new Date('2026-08-20T12:00:00.000Z');
const PAST = new Date('2026-08-19T12:00:00.000Z');
const FUTURE = new Date('2026-08-21T12:00:00.000Z');

function row(overrides: {
  status?: ParticipantStatus;
  entityType?: EntityType;
  trainerId?: string | null;
  sport?: Sport;
  startTime?: Date;
  gameStatus?: GameStatus;
} = {}): TrainingAttendanceRow {
  return {
    status: overrides.status ?? ParticipantStatus.PLAYING,
    game: {
      entityType: overrides.entityType ?? EntityType.TRAINING,
      trainerId: overrides.trainerId ?? null,
      sport: overrides.sport ?? Sport.PADEL,
      startTime: overrides.startTime ?? PAST,
      status: overrides.gameStatus ?? GameStatus.ANNOUNCED,
    },
  };
}

const opts = { now: NOW };

assert.equal(
  countsAsTrainingAttendance(row(), opts),
  true,
  'past PLAYING on TRAINING counts',
);

assert.equal(
  countsAsTrainingAttendance(row({ trainerId: 'user-1' }), opts),
  true,
  'PLAYING participant still counts when they are also trainerId',
);

assert.equal(
  countsAsTrainingAttendance(row({ status: ParticipantStatus.NON_PLAYING, trainerId: 'user-1' }), opts),
  false,
  'trainer-only NON_PLAYING does not count',
);

assert.equal(
  countsAsTrainingAttendance(row({ entityType: EntityType.GAME }), opts),
  false,
  'PLAYING on GAME does not count',
);

assert.equal(
  countsAsTrainingAttendance(row({ entityType: EntityType.TOURNAMENT }), opts),
  false,
  'PLAYING on TOURNAMENT does not count',
);

assert.equal(
  countsAsTrainingAttendance(row({ status: ParticipantStatus.INVITED }), opts),
  false,
  'INVITED on TRAINING does not count',
);

assert.equal(
  countsAsTrainingAttendance(row({ status: ParticipantStatus.IN_QUEUE }), opts),
  false,
  'IN_QUEUE on TRAINING does not count',
);

assert.equal(
  countsAsTrainingAttendance(row({ status: ParticipantStatus.GUEST }), opts),
  false,
  'GUEST on TRAINING does not count',
);

assert.equal(
  countsAsTrainingAttendance(row({ startTime: FUTURE }), opts),
  false,
  'upcoming PLAYING RSVP does not count',
);

assert.equal(
  countsAsTrainingAttendance(
    row({ startTime: FUTURE, gameStatus: GameStatus.FINISHED }),
    opts,
  ),
  true,
  'FINISHED TRAINING still counts if startTime is in the future',
);

assert.equal(
  countsAsTrainingAttendance(
    row({ startTime: PAST, gameStatus: GameStatus.ARCHIVED }),
    opts,
  ),
  true,
  'ARCHIVED past TRAINING counts',
);

assert.equal(
  countsAsTrainingAttendance(row({ sport: Sport.TENNIS }), { ...opts, sport: Sport.PADEL }),
  false,
  'other-sport TRAINING does not count when sport is filtered',
);

assert.equal(
  countsAsTrainingAttendance(row({ sport: Sport.PADEL }), { ...opts, sport: Sport.PADEL }),
  true,
  'matching-sport TRAINING counts when sport is filtered',
);

const where = trainingAttendanceWhere('user-1', { sport: Sport.PADEL, now: NOW });
assert.equal(where.userId, 'user-1');
assert.equal(where.status, ParticipantStatus.PLAYING);
assert.equal(where.game && 'entityType' in where.game && where.game.entityType, EntityType.TRAINING);
assert.equal(where.game && 'sport' in where.game && where.game.sport, Sport.PADEL);
assert.equal('trainerId' in ((where.game ?? {}) as object), false);
assert.deepEqual(
  where.game && 'OR' in where.game ? where.game.OR : undefined,
  [
    { startTime: { lte: NOW } },
    { status: { in: [GameStatus.FINISHED, GameStatus.ARCHIVED] } },
  ],
);

const unscoped = trainingAttendanceWhere('user-1', { now: NOW });
assert.equal('sport' in ((unscoped.game ?? {}) as object), false);

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

  const n = await countTrainingAttendance(db, 'user-1', { sport: Sport.PADEL, now: NOW });
  assert.equal(n, 0, 'empty/zero is a valid count');
  assert.deepEqual(lastWhere, trainingAttendanceWhere('user-1', { sport: Sport.PADEL, now: NOW }));

  console.log('trainingAttendanceCount.test: ok');
})().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
