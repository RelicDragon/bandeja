import assert from 'node:assert/strict';
import {
  PUSH_INVITE_ACTION_ALLOWED_ACTIONS,
  signPushInviteActionToken,
  verifyPushInviteActionToken,
  type PushInviteActionScope,
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

// CONTRACT §5.2 — every kind/action pair round-trips.
const widened: PushInviteActionScope[] = [
  { userId: 'user_123', kind: 'team', targetId: 'team_invite_1', action: 'decline' },
  { userId: 'user_123', kind: 'series', targetId: 'game_next_1', action: 'accept' },
  { userId: 'user_123', kind: 'series', targetId: 'game_next_1', action: 'decline' },
  { userId: 'user_123', kind: 'attendance', targetId: 'game_1', action: 'confirm' },
  { userId: 'user_123', kind: 'attendance', targetId: 'game_1', action: 'unsure' },
  { userId: 'user_123', kind: 'weather', targetId: 'game_1', action: 'keep' },
];
for (const candidate of widened) {
  assert.deepEqual(
    verifyPushInviteActionToken(signPushInviteActionToken(candidate)),
    candidate,
    `${candidate.kind}/${candidate.action} must round-trip`,
  );
}

// A kind never accepts an action outside its own list — a `game` token must not
// smuggle `keep` past the controller's accept/decline ternary.
assert.throws(
  () =>
    signPushInviteActionToken({
      userId: 'user_123',
      kind: 'game',
      targetId: 'invite_456',
      action: 'keep',
    }),
  /Unsupported push invite action/,
);
assert.throws(() =>
  signPushInviteActionToken({
    userId: 'user_123',
    kind: 'weather',
    targetId: 'game_1',
    action: 'accept',
  }),
);
assert.deepEqual([...PUSH_INVITE_ACTION_ALLOWED_ACTIONS.weather], ['keep']);
assert.deepEqual([...PUSH_INVITE_ACTION_ALLOWED_ACTIONS.attendance], ['confirm', 'unsure']);

console.log('pushInviteActionToken.service.test.ts: ok');
