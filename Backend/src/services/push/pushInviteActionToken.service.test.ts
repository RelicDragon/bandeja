import assert from 'node:assert/strict';
import {
  signPushInviteActionToken,
  verifyPushInviteActionToken,
} from './pushInviteActionToken.service';

const scope = {
  userId: 'user_123',
  kind: 'game' as const,
  targetId: 'invite_456',
  action: 'accept' as const,
};
const token = signPushInviteActionToken(scope);
assert.deepEqual(verifyPushInviteActionToken(token), scope);
assert.throws(() => verifyPushInviteActionToken(`${token}x`));
assert.throws(() => verifyPushInviteActionToken('short'));

console.log('pushInviteActionToken.service.test.ts: ok');
