/**
 * PRD 351 — referral abuse rules.
 *
 * Pure module: it takes two already-loaded identity fingerprints and answers
 * "may this pair be rewarded?". Keeping it free of Prisma means every rule has
 * a cheap unit test, which matters more here than anywhere else in the
 * programme — this is the only feature in PRDs 345–357 that mints currency.
 *
 * The rules are evaluated **at conversion** (when the referrer is attached) and
 * again **at payout**, because a second account can acquire a shared phone or a
 * shared device between the two moments.
 */

export const REFERRAL_ABUSE_REASONS = [
  /** The code belongs to the user trying to redeem it. */
  'SELF',
  /** Both accounts are linked to the same Telegram account. */
  'SHARED_TELEGRAM',
  /** Both accounts carry the same verified phone number. */
  'SHARED_PHONE',
  /** The same push registration token is installed for both accounts. */
  'SHARED_PUSH_TOKEN',
  /** The same device id appears on both accounts (push registration or refresh session). */
  'SHARED_DEVICE',
  /** The referrer has already been paid for {@link REFERRAL_REWARDED_CAP} referrals. */
  'CAP_REACHED',
  /** One of the two accounts could not be loaded. Defensive; treated as "not a valid code". */
  'UNKNOWN',
] as const;

export type ReferralAbuseReason = (typeof REFERRAL_ABUSE_REASONS)[number];

/**
 * Everything the abuse rules need about one account.
 *
 * All collections are already normalized by {@link buildReferralFingerprint};
 * empty values are dropped so two accounts that both have "no device id" do not
 * look like they share one. That bug would have blocked every web-only signup.
 */
export interface ReferralFingerprint {
  userId: string;
  telegramId: string | null;
  phone: string | null;
  pushTokens: string[];
  deviceIds: string[];
}

export interface ReferralFingerprintInput {
  userId: string;
  telegramId?: string | null;
  phone?: string | null;
  pushTokens?: (string | null | undefined)[];
  deviceIds?: (string | null | undefined)[];
}

function cleanScalar(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

function cleanSet(values: (string | null | undefined)[] | undefined): string[] {
  if (!values) return [];
  const out = new Set<string>();
  for (const value of values) {
    const cleaned = cleanScalar(value);
    if (cleaned) out.add(cleaned);
  }
  return [...out];
}

export function buildReferralFingerprint(input: ReferralFingerprintInput): ReferralFingerprint {
  return {
    userId: input.userId,
    telegramId: cleanScalar(input.telegramId),
    phone: cleanScalar(input.phone),
    pushTokens: cleanSet(input.pushTokens),
    deviceIds: cleanSet(input.deviceIds),
  };
}

function intersects(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const set = new Set(a);
  return b.some((value) => set.has(value));
}

/**
 * Returns the first rule the pair violates, or `null` when the pair is clean.
 *
 * Order is deliberate: `SELF` first because it is the only one the user can
 * see and fix, then the identity overlaps from strongest signal to weakest.
 * The cap is **not** checked here — it depends on the referrer's payout history
 * rather than on the pair, and lives in {@link isReferralCapReached}.
 */
export function detectReferralAbuse(
  referrer: ReferralFingerprint,
  referred: ReferralFingerprint,
): ReferralAbuseReason | null {
  if (referrer.userId === referred.userId) return 'SELF';
  if (referrer.telegramId && referrer.telegramId === referred.telegramId) return 'SHARED_TELEGRAM';
  if (referrer.phone && referrer.phone === referred.phone) return 'SHARED_PHONE';
  if (intersects(referrer.pushTokens, referred.pushTokens)) return 'SHARED_PUSH_TOKEN';
  if (intersects(referrer.deviceIds, referred.deviceIds)) return 'SHARED_DEVICE';
  return null;
}

/** `rewardedCount` must exclude revoked rows — a revoked reward frees a slot again. */
export function isReferralCapReached(rewardedCount: number, cap: number): boolean {
  return rewardedCount >= cap;
}

/**
 * i18n key for the field error shown next to the manual code input.
 *
 * Keys live under `referral.errors.*`, i.e. inside this PRD's own i18n
 * namespace (`Frontend/src/i18n/locales/<code>/referral.json`), rather than the
 * house `errors.<domain>.*` convention. `errors.json` is a shared file this
 * agent does not own, and a key that is not in a bundle falls back to being
 * rendered raw — the user would see `errors.referral.selfCode` on screen.
 *
 * The identity overlaps deliberately collapse to one message: naming which
 * signal matched ("same phone as another account") would confirm the existence
 * of a second account to whoever is probing.
 */
export function referralAbuseErrorKey(reason: ReferralAbuseReason): string {
  switch (reason) {
    case 'SELF':
      return 'referral.errors.selfCode';
    case 'CAP_REACHED':
      return 'referral.errors.capReached';
    case 'UNKNOWN':
      return 'referral.errors.invalidCode';
    default:
      return 'referral.errors.sharedIdentity';
  }
}
