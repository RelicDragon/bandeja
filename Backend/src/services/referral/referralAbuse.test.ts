import assert from 'node:assert/strict';
import {
  buildReferralFingerprint,
  detectReferralAbuse,
  isReferralCapReached,
  referralAbuseErrorKey,
  REFERRAL_ABUSE_REASONS,
} from './referralAbuse';
import { REFERRAL_REWARDED_CAP } from './referralCode';

const alice = buildReferralFingerprint({
  userId: 'alice',
  telegramId: '111',
  phone: '+3810001',
  pushTokens: ['tok-a'],
  deviceIds: ['dev-a'],
});

const bob = buildReferralFingerprint({
  userId: 'bob',
  telegramId: '222',
  phone: '+3810002',
  pushTokens: ['tok-b'],
  deviceIds: ['dev-b'],
});

// ---------------------------------------------------------------------------
// the clean case
// ---------------------------------------------------------------------------

assert.equal(detectReferralAbuse(alice, bob), null, 'two unrelated accounts are eligible');

// ---------------------------------------------------------------------------
// every abuse rule
// ---------------------------------------------------------------------------

assert.equal(detectReferralAbuse(alice, alice), 'SELF');

assert.equal(
  detectReferralAbuse(alice, buildReferralFingerprint({ ...bob, telegramId: '111' })),
  'SHARED_TELEGRAM',
);

assert.equal(
  detectReferralAbuse(alice, buildReferralFingerprint({ ...bob, phone: '+3810001' })),
  'SHARED_PHONE',
);

assert.equal(
  detectReferralAbuse(alice, buildReferralFingerprint({ ...bob, pushTokens: ['tok-x', 'tok-a'] })),
  'SHARED_PUSH_TOKEN',
);

assert.equal(
  detectReferralAbuse(alice, buildReferralFingerprint({ ...bob, deviceIds: ['dev-a'] })),
  'SHARED_DEVICE',
);

// `SELF` wins over every identity overlap, because it is the only reason the
// user can act on.
assert.equal(detectReferralAbuse(alice, buildReferralFingerprint({ ...alice })), 'SELF');

// ---------------------------------------------------------------------------
// empty values must not look like a shared identity
// ---------------------------------------------------------------------------

const emptyA = buildReferralFingerprint({ userId: 'a' });
const emptyB = buildReferralFingerprint({ userId: 'b' });
assert.equal(
  detectReferralAbuse(emptyA, emptyB),
  null,
  'two web-only signups share nothing, they just have nothing',
);

const blankStrings = buildReferralFingerprint({
  userId: 'c',
  telegramId: '  ',
  phone: '',
  pushTokens: ['', null, undefined, '  '],
  deviceIds: ['', '   '],
});
assert.equal(blankStrings.telegramId, null, 'whitespace is not an identity');
assert.equal(blankStrings.phone, null);
assert.deepEqual(blankStrings.pushTokens, []);
assert.deepEqual(blankStrings.deviceIds, []);
assert.equal(detectReferralAbuse(blankStrings, emptyB), null);

// Duplicates inside one account collapse; an account is not "sharing with
// itself".
const duped = buildReferralFingerprint({
  userId: 'd',
  pushTokens: ['t', 't', 't'],
  deviceIds: ['dev', 'dev'],
});
assert.deepEqual(duped.pushTokens, ['t']);
assert.deepEqual(duped.deviceIds, ['dev']);

// Values are trimmed before comparison, so " dev-a " and "dev-a" are the same
// device.
assert.equal(
  detectReferralAbuse(alice, buildReferralFingerprint({ ...bob, deviceIds: [' dev-a '] })),
  'SHARED_DEVICE',
);

// A device id may arrive from a push registration on one side and a refresh
// session on the other — `deviceIds` merges both sources before comparing.
assert.equal(
  detectReferralAbuse(
    buildReferralFingerprint({ userId: 'e', deviceIds: ['shared'] }),
    buildReferralFingerprint({ userId: 'f', deviceIds: ['other', 'shared'] }),
  ),
  'SHARED_DEVICE',
);

// ---------------------------------------------------------------------------
// the cap
// ---------------------------------------------------------------------------

assert.equal(isReferralCapReached(0, REFERRAL_REWARDED_CAP), false);
assert.equal(isReferralCapReached(49, REFERRAL_REWARDED_CAP), false);
assert.equal(isReferralCapReached(50, REFERRAL_REWARDED_CAP), true, 'the 51st invite pays nothing');
assert.equal(isReferralCapReached(51, REFERRAL_REWARDED_CAP), true);

// ---------------------------------------------------------------------------
// error keys
// ---------------------------------------------------------------------------

assert.equal(referralAbuseErrorKey('SELF'), 'referral.errors.selfCode');
assert.equal(referralAbuseErrorKey('CAP_REACHED'), 'referral.errors.capReached');
for (const reason of ['SHARED_TELEGRAM', 'SHARED_PHONE', 'SHARED_PUSH_TOKEN', 'SHARED_DEVICE'] as const) {
  assert.equal(
    referralAbuseErrorKey(reason),
    'referral.errors.sharedIdentity',
    'identity overlaps share one message — naming the matched signal would leak another account',
  );
}
for (const reason of REFERRAL_ABUSE_REASONS) {
  assert.ok(referralAbuseErrorKey(reason).startsWith('referral.errors.'));
}

console.log('referralAbuse.test.ts: all assertions passed');
