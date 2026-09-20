/**
 * PRD 351 — referral code helpers, frontend copy.
 *
 * Deliberately duplicated from `Backend/src/services/referral/referralCode.ts`
 * rather than shared through `@bandeja/shared`: the backend module is imported
 * by the Prisma-facing services and the shared package is a hard dependency of
 * both builds, so a copy with a test on each side is cheaper than widening the
 * shared surface for four pure functions. **Both files must change together** —
 * `referralCode.test.ts` on each side asserts the same table of cases.
 *
 * Pure module, no React, no imports from the app: `utils/appAttribution.ts`
 * depends on it, and that file runs before anything else at boot.
 */

/** 32 unambiguous characters — no `0`, `O`, `1` or `I`. */
export const REFERRAL_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export const REFERRAL_CODE_LENGTH = 8;
export const REFERRAL_CODE_GROUP_SIZE = 4;
export const REFERRAL_CODE_PATTERN = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;

/** Query parameter shared by the landing page, deep links and every share link. */
export const REFERRAL_QUERY_PARAM = 'ref';

/** Manual entry closes this long after the account was created. */
export const REFERRAL_MANUAL_CODE_WINDOW_DAYS = 7;

/** Debounce before the inline validation request fires, per the PRD. */
export const REFERRAL_CODE_VALIDATE_DEBOUNCE_MS = 300;

export function isReferralCode(value: unknown): value is string {
  return typeof value === 'string' && REFERRAL_CODE_PATTERN.test(value);
}

/**
 * Canonicalises anything a human or a URL might carry into the stored form.
 * Returns `null` for anything that is not a valid code — including one
 * containing `0`, `O`, `1` or `I`, which are not in the alphabet and must not
 * be silently rewritten into a different, real code.
 */
export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const stripped = raw.trim().toUpperCase().replace(/[\s\-_.]+/g, '');
  return REFERRAL_CODE_PATTERN.test(stripped) ? stripped : null;
}

/** `BNDJ7K2Q` → `BNDJ-7K2Q`. Unknown input is returned unchanged. */
export function formatReferralCode(code: string): string {
  if (!isReferralCode(code)) return code;
  return `${code.slice(0, REFERRAL_CODE_GROUP_SIZE)}-${code.slice(REFERRAL_CODE_GROUP_SIZE)}`;
}

/**
 * Progressive formatting for the manual-entry field: uppercases, drops
 * out-of-alphabet characters, caps the length and inserts the dash as the user
 * types. Idempotent, so it is safe to run on every keystroke.
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

/**
 * `BNDJ7K2Q` → `B N D J 7 K 2 Q`.
 *
 * The code pill's accessible name uses this: screen readers run an
 * unspaced code together into a nonsense word, and the whole point of the pill
 * is that somebody can read the code out to a friend.
 */
export function spellReferralCode(code: string): string {
  return code.split('').join(' ');
}

/** Appends `?ref=CODE` (or `&ref=CODE`) to a URL without disturbing existing params. */
export function withReferralParam(url: string, code: string | null | undefined): string {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return url;
  const [base, hash = ''] = url.split('#');
  if (new RegExp(`[?&]${REFERRAL_QUERY_PARAM}=`).test(base)) return url;
  const separator = base.includes('?') ? '&' : '?';
  const withRef = `${base}${separator}${REFERRAL_QUERY_PARAM}=${formatReferralCode(normalized)}`;
  return hash ? `${withRef}#${hash}` : withRef;
}

/** `true` while `now` is inside the manual-entry window that opened at `createdAt`. */
export function isWithinManualCodeWindow(createdAt: Date, now: Date = new Date()): boolean {
  const windowMs = REFERRAL_MANUAL_CODE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() - createdAt.getTime() <= windowMs;
}
