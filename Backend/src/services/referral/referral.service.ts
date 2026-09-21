import prisma from '../../config/database';
import { config } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import {
  getNumericSetting,
  PLATFORM_SETTING_KEYS,
} from '../platformSetting.service';
import {
  buildReferralFingerprint,
  detectReferralAbuse,
  isReferralCapReached,
  referralAbuseErrorKey,
  type ReferralAbuseReason,
  type ReferralFingerprint,
} from './referralAbuse';
import {
  formatReferralCode,
  isReferralCode,
  isWithinManualCodeWindow,
  normalizeReferralCode,
  REFERRAL_DEFAULT_REFERRED_REWARD,
  REFERRAL_DEFAULT_REFERRER_REWARD,
  REFERRAL_QUERY_PARAM,
  REFERRAL_REWARDED_CAP,
  referralCodeFromBytes,
} from './referralCode';
import { randomBytes } from 'crypto';

/** How many invite rows the profile list returns. The card is a nudge, not a CRM. */
export const REFERRAL_INVITES_PAGE_SIZE = 50;

/** Collision retries before giving up. 32^8 ≈ 1.1e12 codes, so two is already generous. */
const CODE_GENERATION_ATTEMPTS = 6;

export type ReferralInviteState = 'INVITED' | 'JOINED' | 'PLAYED';

export interface ReferralInvite {
  /** User id for a joined invite, attribution id for a pending one. Only used as a React key. */
  id: string;
  state: ReferralInviteState;
  /** `null` while the invite has not converted into an account yet. */
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    avatar: string | null;
  } | null;
  /** ISO timestamp of the account being created, or of the link being opened. */
  at: string;
  /** Coins the referrer actually received for this invite. `null` until it pays out. */
  rewardCoins: number | null;
}

export interface ReferralSummary {
  code: string;
  /** `BNDJ-7K2Q` — the only form ever shown to a user. */
  displayCode: string;
  /** `https://bandeja.me/link-to-app/?ref=BNDJ-7K2Q` */
  link: string;
  referrerReward: number;
  referredReward: number;
  /** Rewarded, non-revoked referrals. Drives the cap message. */
  rewardedCount: number;
  cap: number;
  capReached: boolean;
  invites: ReferralInvite[];
}

export interface ReferralRewardAmounts {
  referrer: number;
  referred: number;
}

/** Reads both payout amounts from `PlatformSetting`, falling back to the PRD defaults. */
export async function getReferralRewardAmounts(): Promise<ReferralRewardAmounts> {
  const [referrer, referred] = await Promise.all([
    getNumericSetting(
      PLATFORM_SETTING_KEYS.REFERRAL_REWARD_REFERRER,
      REFERRAL_DEFAULT_REFERRER_REWARD,
    ),
    getNumericSetting(
      PLATFORM_SETTING_KEYS.REFERRAL_REWARD_REFERRED,
      REFERRAL_DEFAULT_REFERRED_REWARD,
    ),
  ]);
  const clamp = (value: number | null, fallback: number): number => {
    if (value === null || !Number.isFinite(value)) return fallback;
    const rounded = Math.floor(value);
    return rounded > 0 ? rounded : 0;
  };
  return {
    referrer: clamp(referrer, REFERRAL_DEFAULT_REFERRER_REWARD),
    referred: clamp(referred, REFERRAL_DEFAULT_REFERRED_REWARD),
  };
}

/** `https://bandeja.me/link-to-app/?ref=BNDJ-7K2Q` — the canonical personal invite link. */
export function buildReferralLink(code: string): string {
  const base = config.frontendUrl.replace(/\/+$/, '');
  return `${base}/link-to-app/?${REFERRAL_QUERY_PARAM}=${formatReferralCode(code)}`;
}

/**
 * Returns the user's referral code, generating it on first use.
 *
 * Generation is collision-safe without a transaction: the column is
 * `@unique`, so a racing duplicate fails the write with P2002 and we simply
 * draw again. Re-reading the row after a lost race is what makes the function
 * idempotent — two concurrent callers end up with the same code, never two.
 */
export async function ensureReferralCode(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (!existing) throw new ApiError(404, 'referral.errors.userNotFound');
  if (existing.referralCode && isReferralCode(existing.referralCode)) {
    return existing.referralCode;
  }

  for (let attempt = 0; attempt < CODE_GENERATION_ATTEMPTS; attempt += 1) {
    const candidate = referralCodeFromBytes(randomBytes(16));
    const taken = await prisma.user.findUnique({
      where: { referralCode: candidate },
      select: { id: true },
    });
    if (taken) continue;
    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { referralCode: candidate },
        select: { referralCode: true },
      });
      return updated.referralCode ?? candidate;
    } catch {
      // Unique-constraint race, or the row grew a code from a concurrent
      // caller. Re-read before drawing again so we never overwrite a code that
      // has already been shared.
      const reread = await prisma.user.findUnique({
        where: { id: userId },
        select: { referralCode: true },
      });
      if (reread?.referralCode && isReferralCode(reread.referralCode)) {
        return reread.referralCode;
      }
    }
  }
  throw new ApiError(503, 'referral.errors.codeUnavailable');
}

export interface PublicReferrer {
  /** First name only — the landing page is unauthenticated (PRD 351). */
  firstName: string | null;
  avatar: string | null;
}

/**
 * Resolves `?ref=CODE` for the unauthenticated landing page.
 *
 * Projects to exactly two fields. Anything wider would turn a guessable
 * 8-character code into a people-search endpoint.
 */
export async function resolvePublicReferrer(rawCode: unknown): Promise<PublicReferrer | null> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return null;
  const user = await prisma.user.findUnique({
    where: { referralCode: code },
    select: { firstName: true, avatar: true, isActive: true },
  });
  if (!user || !user.isActive) return null;
  return { firstName: user.firstName, avatar: user.avatar };
}

/** Resolves a code to its owner's id, or `null`. Internal — never returned to a guest. */
export async function resolveReferrerUserId(rawCode: unknown): Promise<string | null> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return null;
  const user = await prisma.user.findUnique({
    where: { referralCode: code },
    select: { id: true, isActive: true },
  });
  return user && user.isActive ? user.id : null;
}

/** Loads the identity signals the abuse rules compare. One query per source, batched. */
export async function loadReferralFingerprint(userId: string): Promise<ReferralFingerprint | null> {
  const [user, pushTokens, sessions] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, telegramId: true, phone: true },
    }),
    prisma.pushToken.findMany({
      where: { userId },
      select: { token: true, deviceId: true },
    }),
    prisma.userRefreshSession.findMany({
      where: { userId },
      select: { deviceId: true },
      take: 100,
    }),
  ]);
  if (!user) return null;
  return buildReferralFingerprint({
    userId: user.id,
    telegramId: user.telegramId,
    phone: user.phone,
    pushTokens: pushTokens.map((row) => row.token),
    deviceIds: [
      ...pushTokens.map((row) => row.deviceId),
      ...sessions.map((row) => row.deviceId),
    ],
  });
}

/** Rewarded, non-revoked referrals for one referrer. A revoked row frees its cap slot. */
export async function countRewardedReferrals(referrerUserId: string): Promise<number> {
  return prisma.referralReward.count({
    where: { referrerUserId, revokedAt: null },
  });
}

/**
 * Runs every pair rule plus the cap.
 *
 * Called twice per referral — once when the referrer is attached and once
 * before the coins move — because the second account can acquire a shared
 * phone, push token or device between those two moments.
 */
export async function checkReferralEligibility(
  referrerUserId: string,
  referredUserId: string,
): Promise<ReferralAbuseReason | null> {
  if (referrerUserId === referredUserId) return 'SELF';
  const [referrer, referred] = await Promise.all([
    loadReferralFingerprint(referrerUserId),
    loadReferralFingerprint(referredUserId),
  ]);
  if (!referrer || !referred) return 'UNKNOWN';
  const pairReason = detectReferralAbuse(referrer, referred);
  if (pairReason) return pairReason;
  const rewarded = await countRewardedReferrals(referrerUserId);
  return isReferralCapReached(rewarded, REFERRAL_REWARDED_CAP) ? 'CAP_REACHED' : null;
}

export interface AttachReferrerResult {
  attached: boolean;
  reason: ReferralAbuseReason | 'ALREADY_REFERRED' | 'WINDOW_CLOSED' | 'UNKNOWN_CODE' | null;
  referrerUserId: string | null;
}

/**
 * First-touch attach of a referrer to an account.
 *
 * **Load-bearing invariant:** `User.referredByUserId` is written exactly once
 * and never overwritten, mirroring `mergeAttributionFirstTouch` on the
 * link-to-app pipeline (`docs/product/constraints.md` → Link-to-app
 * first-touch). The `updateMany … where: { referredByUserId: null }` is what
 * enforces it under concurrency: two simultaneous attaches cannot both win.
 *
 * The 7-day window applies here too, not only to manual entry. Without it an
 * account created three years ago could open a fresh referral link and be
 * marked as somebody's referral, which is exactly the loop the cap exists to
 * prevent.
 */
export async function attachReferrer(
  referredUserId: string,
  referrerUserId: string,
  options?: { attributionId?: string | null; enforceWindow?: boolean },
): Promise<AttachReferrerResult> {
  const enforceWindow = options?.enforceWindow !== false;
  const referred = await prisma.user.findUnique({
    where: { id: referredUserId },
    select: { id: true, referredByUserId: true, createdAt: true },
  });
  if (!referred) {
    return { attached: false, reason: 'UNKNOWN_CODE', referrerUserId: null };
  }
  if (referred.referredByUserId) {
    return {
      attached: false,
      reason: 'ALREADY_REFERRED',
      referrerUserId: referred.referredByUserId,
    };
  }
  if (enforceWindow && !isWithinManualCodeWindow(referred.createdAt)) {
    return { attached: false, reason: 'WINDOW_CLOSED', referrerUserId: null };
  }

  const abuse = await checkReferralEligibility(referrerUserId, referredUserId);
  if (abuse && abuse !== 'CAP_REACHED') {
    // A capped referrer still gets the social link; only the payout is capped.
    return { attached: false, reason: abuse, referrerUserId: null };
  }

  const updated = await prisma.user.updateMany({
    where: { id: referredUserId, referredByUserId: null },
    data: { referredByUserId: referrerUserId },
  });
  if (updated.count === 0) {
    const current = await prisma.user.findUnique({
      where: { id: referredUserId },
      select: { referredByUserId: true },
    });
    return {
      attached: false,
      reason: 'ALREADY_REFERRED',
      referrerUserId: current?.referredByUserId ?? null,
    };
  }

  if (options?.attributionId) {
    // First-touch on the attribution row as well: `referrerUserId: null` in the
    // filter means a later touch carrying a different `ref` cannot rewrite it.
    await prisma.linkToAppAttribution.updateMany({
      where: { id: options.attributionId, referrerUserId: null },
      data: { referrerUserId },
    });
  }

  await notifyReferrerOfJoin(referrerUserId, referredUserId).catch((error: unknown) => {
    console.error('[Referral] join notification failed:', error);
  });

  return { attached: true, reason: null, referrerUserId };
}

/**
 * `POST /users/me/referral-code`. Manual entry inside the 7-day window, only
 * while the account has no referrer.
 */
export async function applyManualReferralCode(
  userId: string,
  rawCode: unknown,
): Promise<{ referrer: PublicReferrer }> {
  const code = normalizeReferralCode(rawCode);
  if (!code) throw new ApiError(400, 'referral.errors.invalidCode');

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, referredByUserId: true, createdAt: true, referralCode: true },
  });
  if (!me) throw new ApiError(404, 'referral.errors.userNotFound');
  if (me.referralCode === code) throw new ApiError(400, 'referral.errors.selfCode');
  if (me.referredByUserId) throw new ApiError(400, 'referral.errors.alreadyReferred');
  if (!isWithinManualCodeWindow(me.createdAt)) {
    throw new ApiError(400, 'referral.errors.windowClosed');
  }

  const referrerUserId = await resolveReferrerUserId(code);
  if (!referrerUserId) throw new ApiError(400, 'referral.errors.invalidCode');

  const result = await attachReferrer(userId, referrerUserId);
  if (!result.attached) {
    if (result.reason === 'ALREADY_REFERRED') {
      throw new ApiError(400, 'referral.errors.alreadyReferred');
    }
    if (result.reason === 'WINDOW_CLOSED') {
      throw new ApiError(400, 'referral.errors.windowClosed');
    }
    if (result.reason === 'UNKNOWN_CODE' || result.reason === null) {
      throw new ApiError(400, 'referral.errors.invalidCode');
    }
    throw new ApiError(400, referralAbuseErrorKey(result.reason));
  }

  const referrer = await prisma.user.findUnique({
    where: { id: referrerUserId },
    select: { firstName: true, avatar: true },
  });
  return { referrer: { firstName: referrer?.firstName ?? null, avatar: referrer?.avatar ?? null } };
}

/** Who referred me, for the register/onboarding banner. `null` when nobody did. */
export async function getMyReferrer(userId: string): Promise<{
  referrer: PublicReferrer | null;
  canEnterCode: boolean;
  windowClosed: boolean;
  referredReward: number;
}> {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      createdAt: true,
      referredByUser: { select: { firstName: true, avatar: true } },
    },
  });
  if (!me) throw new ApiError(404, 'referral.errors.userNotFound');
  const amounts = await getReferralRewardAmounts();
  const inWindow = isWithinManualCodeWindow(me.createdAt);
  return {
    referrer: me.referredByUser
      ? { firstName: me.referredByUser.firstName, avatar: me.referredByUser.avatar }
      : null,
    canEnterCode: !me.referredByUser && inWindow,
    windowClosed: !me.referredByUser && !inWindow,
    referredReward: amounts.referred,
  };
}

/** Everything the Profile "Invite friends" card and "Your invites" list render. */
export async function getReferralSummary(userId: string): Promise<ReferralSummary> {
  const code = await ensureReferralCode(userId);
  const [amounts, rewardedCount, joined, pending, rewards] = await Promise.all([
    getReferralRewardAmounts(),
    countRewardedReferrals(userId),
    prisma.user.findMany({
      where: { referredByUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: REFERRAL_INVITES_PAGE_SIZE,
      select: { id: true, firstName: true, lastName: true, avatar: true, createdAt: true },
    }),
    prisma.linkToAppAttribution.findMany({
      where: { referrerUserId: userId, convertedUserId: null },
      orderBy: { createdAt: 'desc' },
      take: REFERRAL_INVITES_PAGE_SIZE,
      select: { id: true, createdAt: true },
    }),
    prisma.referralReward.findMany({
      where: { referrerUserId: userId, revokedAt: null },
      select: { referredUserId: true, referrerTx: { select: { total: true } } },
    }),
  ]);

  /**
   * Keyed on every claim row, valued on the *actual* referrer transaction. A
   * claim is kept with `referrerTxId = null` when only the referred side's coin
   * grant landed (`referralReward.service.ts`), so the amount must come from the
   * transaction and never from the configured default: the friend did play
   * ("Played"), but no coins reached this wallet and the chip must not say they
   * did.
   */
  const rewardByUser = new Map(
    rewards.map((row) => [row.referredUserId, row.referrerTx?.total ?? null]),
  );

  const invites: ReferralInvite[] = [
    ...joined.map((user) => {
      const reward = rewardByUser.get(user.id) ?? null;
      return {
        id: user.id,
        state: (rewardByUser.has(user.id) ? 'PLAYED' : 'JOINED') as ReferralInviteState,
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar,
        },
        at: user.createdAt.toISOString(),
        rewardCoins: reward,
      };
    }),
    ...pending.map((row) => ({
      id: row.id,
      state: 'INVITED' as ReferralInviteState,
      user: null,
      at: row.createdAt.toISOString(),
      rewardCoins: null,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, REFERRAL_INVITES_PAGE_SIZE);

  return {
    code,
    displayCode: formatReferralCode(code),
    link: buildReferralLink(code),
    referrerReward: amounts.referrer,
    referredReward: amounts.referred,
    rewardedCount,
    cap: REFERRAL_REWARDED_CAP,
    capReached: isReferralCapReached(rewardedCount, REFERRAL_REWARDED_CAP),
    invites,
  };
}

/**
 * `REFERRAL_JOINED` — referrer only, `sendWalletNotifications` (CONTRACT §5.1).
 * Imported lazily so the notification graph is not pulled into the pure-ish
 * service at module load (and so the reward test can run without it).
 */
async function notifyReferrerOfJoin(referrerUserId: string, referredUserId: string): Promise<void> {
  const [{ default: notificationService }, { NotificationType }] = await Promise.all([
    import('../notification.service'),
    import('../../types/notifications.types'),
  ]);
  const [referrer, referred] = await Promise.all([
    prisma.user.findUnique({ where: { id: referrerUserId }, select: { language: true } }),
    prisma.user.findUnique({ where: { id: referredUserId }, select: { firstName: true } }),
  ]);
  const { referralT } = await import('./referralCopy');
  const lang = referrer?.language || 'en';
  const name = referred?.firstName?.trim() || referralT('referral.someone', lang);
  await notificationService.sendNotification({
    userId: referrerUserId,
    type: NotificationType.REFERRAL_JOINED,
    payload: {
      type: NotificationType.REFERRAL_JOINED,
      title: referralT('referral.joinedTitle', lang),
      body: referralT('referral.joinedBody', lang, { name }),
      data: { userId: referredUserId },
      sound: 'default',
    },
  });
}
