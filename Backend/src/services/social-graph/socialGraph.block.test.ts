import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { ApiError } from '../../utils/ApiError';
import { STORY_ENGAGEMENT_ERROR } from '../storyEngagement/storyEngagement.constants';
import {
  SOCIAL_GRAPH_INTERACT_CONTEXT,
  assertCanInteract,
  hasBlocked,
  isBlocked,
} from './socialGraph.block';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

function ensureDbUrl(): boolean {
  let url = process.env.DB_URL;
  if (!url) return false;
  if (!/[?&]schema=/.test(url)) {
    url += (url.includes('?') ? '&' : '?') + 'schema=padelpulse';
    process.env.DB_URL = url;
  }
  return true;
}

async function expectApiError(
  fn: () => Promise<unknown>,
  statusCode: number,
  message: string,
  code?: string,
): Promise<void> {
  try {
    await fn();
    assert.fail('expected ApiError');
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    assert.equal(err.statusCode, statusCode);
    assert.equal(err.message, message);
    if (code !== undefined) assert.equal(err.data?.code, code);
  }
}

async function testSameUserShortCircuit(): Promise<void> {
  assert.equal(await isBlocked('user-a', 'user-a'), false);
  assert.equal(await hasBlocked('user-a', 'user-a'), false);
  await assertCanInteract('user-a', 'user-a', SOCIAL_GRAPH_INTERACT_CONTEXT.USER_TEAM);
}

async function testContextErrors(): Promise<void> {
  const userA = 'ctx-test-a';
  const userB = 'ctx-test-b';

  const originalFindFirst = (await import('../../config/database')).default.blockedUser.findFirst;
  const db = (await import('../../config/database')).default;
  db.blockedUser.findFirst = (() =>
    Promise.resolve({ id: 'block-1' })) as typeof db.blockedUser.findFirst;

  try {
    await expectApiError(
      () => assertCanInteract(userA, userB, SOCIAL_GRAPH_INTERACT_CONTEXT.STORY_ENGAGEMENT),
      403,
      'Story engagement forbidden',
      STORY_ENGAGEMENT_ERROR.FORBIDDEN,
    );
    await expectApiError(
      () => assertCanInteract(userA, userB, SOCIAL_GRAPH_INTERACT_CONTEXT.USER_TEAM),
      403,
      'errors.userTeams.blocked',
    );
    await expectApiError(
      () => assertCanInteract(userA, userB, SOCIAL_GRAPH_INTERACT_CONTEXT.MARKET_ITEM),
      403,
      'Cannot create chat with this user',
    );
  } finally {
    db.blockedUser.findFirst = originalFindFirst;
  }
}

async function testBidirectionalBlockWithDb(): Promise<void> {
  if (!ensureDbUrl()) {
    console.log('skip bidirectional DB test: DB_URL not set');
    return;
  }

  const { default: prisma } = await import('../../config/database');
  const users = await prisma.user.findMany({
    where: { isActive: true },
    take: 2,
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (users.length < 2) {
    console.log('skip bidirectional DB test: need 2 active users');
    return;
  }

  const [blocker, blocked] = users;

  await prisma.blockedUser.deleteMany({
    where: {
      OR: [
        { userId: blocker.id, blockedUserId: blocked.id },
        { userId: blocked.id, blockedUserId: blocker.id },
      ],
    },
  });

  assert.equal(await isBlocked(blocker.id, blocked.id), false);
  assert.equal(await hasBlocked(blocker.id, blocked.id), false);
  assert.equal(await hasBlocked(blocked.id, blocker.id), false);

  await prisma.blockedUser.create({
    data: { userId: blocker.id, blockedUserId: blocked.id },
  });

  try {
    assert.equal(await isBlocked(blocker.id, blocked.id), true);
    assert.equal(await isBlocked(blocked.id, blocker.id), true);
    assert.equal(await hasBlocked(blocker.id, blocked.id), true);
    assert.equal(await hasBlocked(blocked.id, blocker.id), false);
  } finally {
    await prisma.blockedUser.deleteMany({
      where: {
        OR: [
          { userId: blocker.id, blockedUserId: blocked.id },
          { userId: blocked.id, blockedUserId: blocker.id },
        ],
      },
    });
  }

}

async function main(): Promise<void> {
  await testSameUserShortCircuit();
  await testContextErrors();
  await testBidirectionalBlockWithDb();
  console.log('socialGraph.block.test: passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
