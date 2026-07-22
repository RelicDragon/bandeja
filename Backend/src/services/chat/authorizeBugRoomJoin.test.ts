import assert from 'node:assert/strict';
import { ApiError } from '../../utils/ApiError';
import { MessageService } from './message.service';
import { authorizeBugRoomJoin } from './authorizeBugRoomJoin';

async function withPatchedValidate(
  replacement: typeof MessageService.validateBugAccess,
  run: () => Promise<void>
): Promise<void> {
  const original = MessageService.validateBugAccess;
  MessageService.validateBugAccess = replacement;
  try {
    await run();
  } finally {
    MessageService.validateBugAccess = original;
  }
}

async function run() {
  const noUser = await authorizeBugRoomJoin('bug-1', undefined);
  assert.equal(noUser.ok, false);
  if (!noUser.ok) assert.equal(noUser.code, 'auth.notAuthenticated');

  const badId = await authorizeBugRoomJoin(null, 'u1');
  assert.equal(badId.ok, false);
  if (!badId.ok) assert.equal(badId.code, 'bug.invalidId');

  await withPatchedValidate(
    (async () => {
      throw new ApiError(403, 'Access denied to bug chat', true, { code: 'bug.accessDenied' });
    }) as typeof MessageService.validateBugAccess,
    async () => {
      const denied = await authorizeBugRoomJoin('bug-1', 'stranger');
      assert.equal(denied.ok, false);
      if (!denied.ok) {
        assert.equal(denied.code, 'bug.accessDenied');
        assert.equal(denied.message, 'Access denied to bug chat');
      }
    }
  );

  await withPatchedValidate(
    (async () => ({
      bug: {},
      isSender: true,
      isAdmin: false,
      isParticipant: false,
    })) as unknown as typeof MessageService.validateBugAccess,
    async () => {
      const allowed = await authorizeBugRoomJoin('bug-1', 'sender');
      assert.equal(allowed.ok, true);
    }
  );

  console.log('authorizeBugRoomJoin.test.ts: ok');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
