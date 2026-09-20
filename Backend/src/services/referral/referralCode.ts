/**
 * PRD 351 — referral code alphabet, generation and parsing.
 *
 * Pure module (no Prisma, no I/O) so it can be unit-tested without a database
 * and reused by the Telegram bot, the public landing resolver and the admin
 * export alike.
 *
 * The alphabet deliberately omits `0`, `O`, `1` and `I`: a referral code is
 * read out loud and typed by hand, and those four are the only characters that
 * are genuinely ambiguous in the app's font. Because none of them is a member,
 * a typed `O` is a real mistake rather than a near-miss, so parsing rejects it
 * instead of guessing — guessing would silently attribute a reward to the
 * wrong referrer.
 */

/** 32 unambiguous characters. Never reorder or extend: existing codes depend on membership, not order. */
export const REFERRAL_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export const REFERRAL_CODE_LENGTH = 8;

/** Where the display dash goes: `BNDJ-7K2Q`. */
export const REFERRAL_CODE_GROUP_SIZE = 4;

/** Stored form: uppercase, no separator. */
export const REFERRAL_CODE_PATTERN = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;

/** Manual entry is only accepted this long after the account was created. */
export const REFERRAL_MANUAL_CODE_WINDOW_DAYS = 7;

/** Hard ceiling on rewarded referrals per referrer. Beyond this, invites still work but pay nothing. */
export const REFERRAL_REWARDED_CAP = 50;

/** Fallbacks when `PlatformSetting` has no row (CONTRACT §4.3 seeds both). */
export const REFERRAL_DEFAULT_REFERRER_REWARD = 50;
export const REFERRAL_DEFAULT_REFERRED_REWARD = 25;

/** `TransactionRow.name` for every referral payout. `Transaction` has no `reason` column, so this is it. */
export const REFERRAL_TRANSACTION_REASON = 'REFERRAL';

/** Query parameter the landing page, the SPA and every share link agree on. */
export const REFERRAL_QUERY_PARAM = 'ref';

/**
 * Generates one candidate code from injected randomness.
 *
 * `randomBytes` is a parameter so the collision-retry loop and the unit test
 * can both drive it deterministically. The modulo is unbiased because 256 is a
 * whole multiple of the 32-character alphabet.
 */
export function referralCodeFromBytes(bytes: Uint8Array | Buffer): string {
  let out = '';
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i += 1) {
    const byte = bytes[i] ?? 0;
    out += REFERRAL_CODE_ALPHABET[byte % REFERRAL_CODE_ALPHABET.length];
  }
  return out;
}

/** True for the canonical stored form only (8 chars, uppercase, in-alphabet). */
export function isReferralCode(value: unknown): value is string {
  return typeof value === 'string' && REFERRAL_CODE_PATTERN.test(value);
}

/**
 * Canonicalises anything a human or a URL might carry into the stored form.
 *
 * Accepts lowercase, surrounding whitespace, and any run of spaces, dashes,
 * underscores or dots as the group separator. Returns `null` for everything
 * else — including a code containing `0`, `O`, `1` or `I`, which are not in the
 * alphabet and must not be silently rewritten.
 */
export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const stripped = raw.trim().toUpperCase().replace(/[\s\-_.]+/g, '');
  return REFERRAL_CODE_PATTERN.test(stripped) ? stripped : null;
}

/** Stored form → display form (`BNDJ7K2Q` → `BNDJ-7K2Q`). Unknown input is returned unchanged. */
export function formatReferralCode(code: string): string {
  if (!isReferralCode(code)) return code;
  return `${code.slice(0, REFERRAL_CODE_GROUP_SIZE)}-${code.slice(REFERRAL_CODE_GROUP_SIZE)}`;
}

/**
 * Progressive formatting for the manual-entry field: uppercases, drops
 * out-of-alphabet characters, caps the length and re-inserts the dash as the
 * user types. Shared with the frontend through an identical implementation in
 * `Frontend/src/features/referral/referralCode.ts`.
 */
export function formatReferralCodeInput(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .split('')
    .filter((ch) => REFERRAL_CODE_ALPHABET.includes(ch))
    .join('')
    .slice(0, REFERRAL_CODE_LENGTH);
  if (cleaned.length <= REFERRAL_CODE_GROUP_SIZE) return cleaned;
  return `${cleaned.slice(0, REFERRAL_CODE_GROUP_SIZE)}-${cleaned.slice(REFERRAL_CODE_GROUP_SIZE)}`;
}

/** Spaced-out reading for screen readers: `BNDJ7K2Q` → `B N D J 7 K 2 Q`. */
export function spellReferralCode(code: string): string {
  return code.split('').join(' ');
}

/** `true` while `now` is inside the manual-entry window that opened at `createdAt`. */
export function isWithinManualCodeWindow(createdAt: Date, now: Date = new Date()): boolean {
  const windowMs = REFERRAL_MANUAL_CODE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() - createdAt.getTime() <= windowMs;
}

/** Milliseconds left in the manual-entry window, clamped at 0. */
export function manualCodeWindowRemainingMs(createdAt: Date, now: Date = new Date()): number {
  const windowMs = REFERRAL_MANUAL_CODE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, createdAt.getTime() + windowMs - now.getTime());
}
