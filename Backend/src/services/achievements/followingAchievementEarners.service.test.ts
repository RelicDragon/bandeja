import assert from 'node:assert/strict';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import {
  getFollowingAchievementEarners,
  MAX_FOLLOWING_ACHIEVEMENT_EARNERS,
} from './followingAchievementEarners.service';

type QueryArgs = {
  where: {
    userId: string;
    favoriteUser: {
      isActive: boolean;
      achievements: { some: { definitionId: string; isActive: boolean } };
      blockedUsers: { none: { blockedUserId: string } };
      blockedBy: { none: { userId: string } };
    };
  };
  select: { favoriteUser: { select: Record<string, unknown> } };
  take: number;
};

async function main() {
  const captures: QueryArgs[] = [];
  const fakeDb = {
    userFavoriteUser: {
      findMany: async (args: QueryArgs) => {
        captures.push(args);
        return [{
          favoriteUser: {
            id: 'friend-1',
            firstName: 'Ana',
            lastName: 'Smith',
            avatar: null,
            primarySport: 'PADEL',
            socialLevel: 2.5,
            gender: 'FEMALE',
            approvedLevel: false,
            isTrainer: false,
            sportProfiles: [{
              sport: 'PADEL',
              level: 3.2,
              reliability: 60,
              gamesPlayed: 12,
              gamesWon: 7,
              approvedLevel: true,
              approvedById: 'admin-1',
              approvedWhen: new Date('2026-01-01T00:00:00.000Z'),
            }],
          },
        }];
      },
    },
  } as unknown as typeof prisma;

  const users = await getFollowingAchievementEarners(
    'viewer-1',
    'habit_first_padel_game',
    fakeDb,
  );

  assert.equal(users.length, 1);
  assert.equal(users[0].id, 'friend-1');
  assert.equal(users[0].level, 3.2);
  assert.equal(users[0].reliability, 60);
  assert.equal('sportProfiles' in users[0], false);
  const captured = captures[0];
  assert.ok(captured);
  assert.equal(captured.where.userId, 'viewer-1');
  assert.equal(captured.where.favoriteUser.isActive, true);
  assert.deepEqual(captured.where.favoriteUser.blockedUsers, {
    none: { blockedUserId: 'viewer-1' },
  });
  assert.deepEqual(captured.where.favoriteUser.blockedBy, {
    none: { userId: 'viewer-1' },
  });
  assert.deepEqual(captured.where.favoriteUser.achievements, {
    some: { definitionId: 'habit_first_padel_game', isActive: true },
  });
  assert.equal(captured.take, MAX_FOLLOWING_ACHIEVEMENT_EARNERS);
  assert.equal(
    'weeklyAvailability' in captured.select.favoriteUser.select,
    false,
  );

  await assert.rejects(
    () => getFollowingAchievementEarners('viewer-1', 'unknown-achievement', fakeDb),
    (error: unknown) => error instanceof ApiError && error.statusCode === 404,
  );

  console.log('followingAchievementEarners.service.test.ts: ok');
}

void main();
