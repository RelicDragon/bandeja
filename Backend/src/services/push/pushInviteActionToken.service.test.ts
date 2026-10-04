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
const withoutIssuedAt = ({ issuedAt: _issuedAt, ...rest }: PushInviteActionScope) => rest;
const verified = verifyPushInviteActionToken(token);
assert.deepEqual(withoutIssuedAt(verified), scope);
// `issuedAt` comes from the JWT `iat` (whole seconds) — handlers use it to refuse
// a button sent before the state it answers changed (attendance after a time change).
assert.ok(verified.issuedAt instanceof Date);
assert.ok(Math.abs(verified.issuedAt.getTime() - Date.now()) < 5000);
// Passing `issuedAt` when signing never smuggles it into the token.
assert.notEqual(
  verifyPushInviteActionToken(
    signPushInviteActionToken({ ...scope, issuedAt: new Date('2000-01-01T00:00:00Z') }),
  ).issuedAt?.getUTCFullYear(),
  2000,
);
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
    withoutIssuedAt(verifyPushInviteActionToken(signPushInviteActionToken(candidate))),
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
