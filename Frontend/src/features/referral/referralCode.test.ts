import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  formatReferralCode,
  formatReferralCodeInput,
  isReferralCode,
  isWithinManualCodeWindow,
  normalizeReferralCode,
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_LENGTH,
  REFERRAL_MANUAL_CODE_WINDOW_DAYS,
  REFERRAL_QUERY_PARAM,
  spellReferralCode,
  withReferralParam,
} from './referralCode';

describe('referral code alphabet', () => {
  it('is 32 unambiguous characters', () => {
    expect(REFERRAL_CODE_ALPHABET).toHaveLength(32);
    expect(new Set(REFERRAL_CODE_ALPHABET).size).toBe(32);
    for (const ambiguous of ['0', 'O', '1', 'I']) {
      expect(REFERRAL_CODE_ALPHABET).not.toContain(ambiguous);
    }
  });

  it('matches the backend copy character for character', () => {
    // The two modules are deliberately duplicated (see the header comment in
    // `referralCode.ts`); this is the assertion that keeps them honest.
    const backend = readFileSync(
      join(process.cwd(), '../Backend/src/services/referral/referralCode.ts'),
      'utf8',
    );
    expect(backend).toContain(`'${REFERRAL_CODE_ALPHABET}'`);
    expect(backend).toContain(`export const REFERRAL_CODE_LENGTH = ${REFERRAL_CODE_LENGTH};`);
    expect(backend).toContain(
      `export const REFERRAL_MANUAL_CODE_WINDOW_DAYS = ${REFERRAL_MANUAL_CODE_WINDOW_DAYS};`,
    );
  });
});

describe('normalizeReferralCode', () => {
  it('accepts every form a human or a URL can produce', () => {
    expect(normalizeReferralCode('BNDJ7K2Q')).toBe('BNDJ7K2Q');
    expect(normalizeReferralCode('BNDJ-7K2Q')).toBe('BNDJ7K2Q');
    expect(normalizeReferralCode('bndj-7k2q')).toBe('BNDJ7K2Q');
    expect(normalizeReferralCode('  bndj 7k2q ')).toBe('BNDJ7K2Q');
    expect(normalizeReferralCode('BNDJ_7K2Q')).toBe('BNDJ7K2Q');
  });

  it('rejects rather than guesses at out-of-alphabet characters', () => {
    // Guessing `O -> 0` would silently attribute a payout to another account.
    expect(normalizeReferralCode('BNDJ7K2O')).toBeNull();
    expect(normalizeReferralCode('BNDJ7K20')).toBeNull();
    expect(normalizeReferralCode('BNDJ7K2I')).toBeNull();
    expect(normalizeReferralCode('BNDJ7K21')).toBeNull();
  });

  it('rejects wrong lengths and non-strings', () => {
    expect(normalizeReferralCode('BNDJ7K2')).toBeNull();
    expect(normalizeReferralCode('BNDJ7K2QQ')).toBeNull();
    expect(normalizeReferralCode('')).toBeNull();
    expect(normalizeReferralCode(null)).toBeNull();
    expect(normalizeReferralCode(42)).toBeNull();
    expect(normalizeReferralCode(['BNDJ7K2Q'])).toBeNull();
  });
});

describe('display helpers', () => {
  it('formats and spells the code', () => {
    expect(isReferralCode('BNDJ7K2Q')).toBe(true);
    expect(isReferralCode('BNDJ-7K2Q')).toBe(false);
    expect(formatReferralCode('BNDJ7K2Q')).toBe('BNDJ-7K2Q');
    expect(formatReferralCode('whatever')).toBe('whatever');
    expect(spellReferralCode('BNDJ7K2Q')).toBe('B N D J 7 K 2 Q');
  });

  it('formats progressively while typing and is idempotent', () => {
    expect(formatReferralCodeInput('')).toBe('');
    expect(formatReferralCodeInput('b')).toBe('B');
    expect(formatReferralCodeInput('bndj')).toBe('BNDJ');
    expect(formatReferralCodeInput('bndj7')).toBe('BNDJ-7');
    expect(formatReferralCodeInput('bndj7k2q')).toBe('BNDJ-7K2Q');
    expect(formatReferralCodeInput('BNDJ-7K2Q')).toBe('BNDJ-7K2Q');
    expect(formatReferralCodeInput('bndj7k2qZZZZ')).toBe('BNDJ-7K2Q');
    expect(formatReferralCodeInput('b!n@d#j')).toBe('BNDJ');
    expect(formatReferralCodeInput('0O1I')).toBe('');
  });
});

describe('withReferralParam', () => {
  it('appends the display form with the right separator', () => {
    expect(withReferralParam('https://bandeja.me/games/g1', 'BNDJ7K2Q')).toBe(
      'https://bandeja.me/games/g1?ref=BNDJ-7K2Q',
    );
    expect(withReferralParam('https://bandeja.me/games/g1?join=1', 'BNDJ7K2Q')).toBe(
      'https://bandeja.me/games/g1?join=1&ref=BNDJ-7K2Q',
    );
  });

  it('never double-appends or loses a hash', () => {
    const once = withReferralParam('https://bandeja.me/games/g1', 'BNDJ7K2Q');
    expect(withReferralParam(once, 'AAAA2222')).toBe(once);
    expect(withReferralParam('https://bandeja.me/games/g1#chat', 'BNDJ7K2Q')).toBe(
      'https://bandeja.me/games/g1?ref=BNDJ-7K2Q#chat',
    );
  });

  it('leaves the url alone for a missing or malformed code', () => {
    expect(withReferralParam('https://bandeja.me/', null)).toBe('https://bandeja.me/');
    expect(withReferralParam('https://bandeja.me/', 'nope')).toBe('https://bandeja.me/');
    expect(REFERRAL_QUERY_PARAM).toBe('ref');
  });
});

describe('manual-entry window', () => {
  const day = 24 * 60 * 60 * 1000;
  const created = new Date('2026-03-01T12:00:00.000Z');

  it('is inclusive of the 7th day and closed after it', () => {
    expect(isWithinManualCodeWindow(created, created)).toBe(true);
    expect(isWithinManualCodeWindow(created, new Date(created.getTime() + 7 * day))).toBe(true);
    expect(isWithinManualCodeWindow(created, new Date(created.getTime() + 7 * day + 1))).toBe(false);
    expect(isWithinManualCodeWindow(created, new Date(created.getTime() + 30 * day))).toBe(false);
  });
});
