import assert from 'node:assert/strict';
import {
  formatReferralCode,
  formatReferralCodeInput,
  isReferralCode,
  isWithinManualCodeWindow,
  manualCodeWindowRemainingMs,
  normalizeReferralCode,
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_LENGTH,
  REFERRAL_MANUAL_CODE_WINDOW_DAYS,
  REFERRAL_REWARDED_CAP,
  referralCodeFromBytes,
  spellReferralCode,
} from './referralCode';

// ---------------------------------------------------------------------------
// alphabet
// ---------------------------------------------------------------------------

assert.equal(REFERRAL_CODE_ALPHABET.length, 32, 'a power of two keeps the modulo unbiased');
assert.equal(new Set(REFERRAL_CODE_ALPHABET).size, 32, 'no duplicate characters');
for (const ambiguous of ['0', 'O', '1', 'I']) {
  assert.ok(
    !REFERRAL_CODE_ALPHABET.includes(ambiguous),
    `${ambiguous} is ambiguous when a code is read aloud`,
  );
}

// ---------------------------------------------------------------------------
// generation
// ---------------------------------------------------------------------------

const zeros = referralCodeFromBytes(new Uint8Array(16));
assert.equal(zeros, '2'.repeat(REFERRAL_CODE_LENGTH), 'byte 0 maps to the first character');
assert.ok(isReferralCode(zeros));

const ramp = referralCodeFromBytes(Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]));
assert.equal(ramp.length, REFERRAL_CODE_LENGTH, 'only the first 8 bytes are consumed');
assert.ok(isReferralCode(ramp));

// Byte 32 wraps back to the first character: the mapping is a plain modulo and
// 256 is a whole multiple of 32, so every character is equally likely.
assert.equal(referralCodeFromBytes(Uint8Array.from([32, 32, 32, 32, 32, 32, 32, 32])), '2'.repeat(8));

// A short buffer must not produce `undefined` in the string.
assert.equal(referralCodeFromBytes(Uint8Array.from([5])), '7' + '2'.repeat(7));

// ---------------------------------------------------------------------------
// validation and normalization
// ---------------------------------------------------------------------------

assert.ok(isReferralCode('BNDJ7K2Q'));
assert.ok(!isReferralCode('BNDJ-7K2Q'), 'the stored form carries no dash');
assert.ok(!isReferralCode('bndj7k2q'), 'the stored form is uppercase');
assert.ok(!isReferralCode('BNDJ7K2'), 'too short');
assert.ok(!isReferralCode('BNDJ7K2QQ'), 'too long');
assert.ok(!isReferralCode(null));
assert.ok(!isReferralCode(12345678));

assert.equal(normalizeReferralCode('BNDJ-7K2Q'), 'BNDJ7K2Q');
assert.equal(normalizeReferralCode('bndj-7k2q'), 'BNDJ7K2Q');
assert.equal(normalizeReferralCode('  BNDJ 7K2Q  '), 'BNDJ7K2Q');
assert.equal(normalizeReferralCode('BNDJ_7K2Q'), 'BNDJ7K2Q');
assert.equal(normalizeReferralCode('BNDJ.7K2Q'), 'BNDJ7K2Q');
assert.equal(normalizeReferralCode('BNDJ--7K2Q'), 'BNDJ7K2Q');

// Out-of-alphabet characters are rejected, never silently rewritten: guessing
// would attribute a payout to the wrong referrer.
assert.equal(normalizeReferralCode('BNDJ7K2O'), null, 'O is not in the alphabet');
assert.equal(normalizeReferralCode('BNDJ7K20'), null, '0 is not in the alphabet');
assert.equal(normalizeReferralCode('BNDJ7K2I'), null);
assert.equal(normalizeReferralCode('BNDJ7K21'), null);
assert.equal(normalizeReferralCode(''), null);
assert.equal(normalizeReferralCode(undefined), null);
assert.equal(normalizeReferralCode(['BNDJ7K2Q']), null);

// ---------------------------------------------------------------------------
// display
// ---------------------------------------------------------------------------

assert.equal(formatReferralCode('BNDJ7K2Q'), 'BNDJ-7K2Q');
assert.equal(formatReferralCode('nonsense'), 'nonsense', 'unknown input passes through unchanged');
assert.equal(spellReferralCode('BNDJ7K2Q'), 'B N D J 7 K 2 Q');

// Progressive input formatting (the manual-entry field).
assert.equal(formatReferralCodeInput(''), '');
assert.equal(formatReferralCodeInput('b'), 'B');
assert.equal(formatReferralCodeInput('bndj'), 'BNDJ');
assert.equal(formatReferralCodeInput('bndj7'), 'BNDJ-7');
assert.equal(formatReferralCodeInput('bndj7k2q'), 'BNDJ-7K2Q');
assert.equal(formatReferralCodeInput('BNDJ-7K2Q'), 'BNDJ-7K2Q', 're-formatting is stable');
assert.equal(formatReferralCodeInput('bndj7k2qXXXX'), 'BNDJ-7K2Q', 'length is capped at 8');
assert.equal(formatReferralCodeInput('b!n@d#j'), 'BNDJ', 'junk is dropped, not rejected');
assert.equal(formatReferralCodeInput('0O1I'), '', 'ambiguous characters never enter the field');

// ---------------------------------------------------------------------------
// manual-entry window
// ---------------------------------------------------------------------------

assert.equal(REFERRAL_MANUAL_CODE_WINDOW_DAYS, 7);
assert.equal(REFERRAL_REWARDED_CAP, 50);

const day = 24 * 60 * 60 * 1000;
const created = new Date('2026-03-01T12:00:00.000Z');
assert.ok(isWithinManualCodeWindow(created, created), 'the moment of signup is inside the window');
assert.ok(isWithinManualCodeWindow(created, new Date(created.getTime() + 6 * day)));
assert.ok(
  isWithinManualCodeWindow(created, new Date(created.getTime() + 7 * day)),
  'the boundary is inclusive — "within 7 days" includes the 7th day',
);
assert.ok(!isWithinManualCodeWindow(created, new Date(created.getTime() + 7 * day + 1)));
assert.ok(!isWithinManualCodeWindow(created, new Date(created.getTime() + 30 * day)));

assert.equal(manualCodeWindowRemainingMs(created, created), 7 * day);
assert.equal(manualCodeWindowRemainingMs(created, new Date(created.getTime() + 7 * day)), 0);
assert.equal(
  manualCodeWindowRemainingMs(created, new Date(created.getTime() + 100 * day)),
  0,
  'never negative',
);

console.log('referralCode.test.ts: all assertions passed');
