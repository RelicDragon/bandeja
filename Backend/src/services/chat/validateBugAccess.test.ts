import assert from 'node:assert/strict';
import { ApiError } from '../../utils/ApiError';
import { MessageService } from './message.service';

type BugAccessResult = Awaited<ReturnType<typeof MessageService.validateBugAccess>>;

async function withPatchedFindUnique(
  bugRow: unknown,
  userRow: unknown,
  run: () => Promise<void>
): Promise<void> {
  const prisma = (await import('../../config/database')).default;
  const originalBug = prisma.bug.findUnique;
  const originalUser = prisma.user.findUnique;
  prisma.bug.findUnique = (async () => bugRow) as unknown as typeof prisma.bug.findUnique;
  prisma.user.findUnique = (async () => userRow) as unknown as typeof prisma.user.findUnique;
  try {
    await run();
  } finally {
    prisma.bug.findUnique = originalBug;
    prisma.user.findUnique = originalUser;
  }
}

async function expectDenied(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    throw new Error(`${label}: expected deny`);
  } catch (err) {
    assert(err instanceof ApiError, `${label}: ApiError`);
    assert.equal(err.statusCode, 403, `${label}: status`);
    assert.equal(err.data?.code, 'bug.accessDenied', `${label}: code`);
  }
}

async function run() {
  const bugBase = {
    id: 'bug-1',
    senderId: 'sender-1',
    participants: [] as { userId: string }[],
    sender: {},
  };

  await withPatchedFindUnique(
    { ...bugBase, participants: [] },
    { isAdmin: false },
    async () => {
      await expectDenied('stranger', () => MessageService.validateBugAccess('bug-1', 'stranger-1'));
    }
  );

  await withPatchedFindUnique(
    { ...bugBase, participants: [] },
    { isAdmin: false },
    async () => {
      const result = (await MessageService.validateBugAccess('bug-1', 'sender-1')) as BugAccessResult;
      assert.equal(result.isSender, true);
    }
  );

  await withPatchedFindUnique(
    { ...bugBase, participants: [{ userId: 'p-1' }] },
    { isAdmin: false },
    async () => {
      const result = (await MessageService.validateBugAccess('bug-1', 'p-1')) as BugAccessResult;
      assert.equal(result.isParticipant, true);
    }
  );

  await withPatchedFindUnique(
    { ...bugBase, participants: [] },
    { isAdmin: true },
    async () => {
      const result = (await MessageService.validateBugAccess('bug-1', 'admin-1')) as BugAccessResult;
      assert.equal(result.isAdmin, true);
    }
  );

  console.log('validateBugAccess.test.ts: ok');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
