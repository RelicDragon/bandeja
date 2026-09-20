import { normalizeReferralCode, REFERRAL_CODE_LENGTH } from './referralCode';

/**
 * PRD 351 — local validation for the manual code field.
 *
 * Runs on every keystroke and decides whether a network check is worth making.
 * Pure and exhaustively tested, because the field is the one place a user can
 * be told "that code isn't valid" and every wrong answer there is a support
 * ticket.
 */
export type ReferralCodeLocalStatus =
  /** Nothing typed yet — no error, no request. */
  | 'empty'
  /** Fewer than 8 characters — no error yet, the user is still typing. */
  | 'incomplete'
  /** Eight characters, but not a possible code. */
  | 'invalid'
  /** The viewer's own code. Caught locally so the error is instant. */
  | 'self'
  /** Worth sending to the server. */
  | 'ready';

export interface ReferralCodeLocalResult {
  status: ReferralCodeLocalStatus;
  /** Canonical stored form, set only when `status === 'ready'` or `'self'`. */
  code: string | null;
}

/** Characters that survive `formatReferralCodeInput`, i.e. what is really typed. */
function typedLength(raw: string): number {
  return raw.replace(/[^0-9A-Za-z]/g, '').length;
}

export function validateReferralCodeInput(
  raw: string,
  ownCode?: string | null,
): ReferralCodeLocalResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { status: 'empty', code: null };

  const code = normalizeReferralCode(trimmed);
  if (!code) {
    // Still short enough to be mid-typing: do not shout at somebody who has
    // entered three of eight characters.
    return typedLength(trimmed) < REFERRAL_CODE_LENGTH
      ? { status: 'incomplete', code: null }
      : { status: 'invalid', code: null };
  }

  const own = normalizeReferralCode(ownCode);
  if (own && own === code) return { status: 'self', code };

  return { status: 'ready', code };
}

/** The `referral.json` key for a local status, or `null` when there is nothing to say. */
export function referralCodeErrorKey(status: ReferralCodeLocalStatus): string | null {
  switch (status) {
    case 'invalid':
      return 'referral.errors.invalidCode';
    case 'self':
      return 'referral.errors.selfCode';
    default:
      return null;
  }
}
