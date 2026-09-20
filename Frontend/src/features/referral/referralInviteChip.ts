import type { ReferralInviteState } from '@/api/referral';

/**
 * PRD 351 — presentation rules for the "Your invites" state chip.
 *
 * Pure so the three states can be asserted without rendering, and so the
 * component file stays component-only (CONTRACT §0 rule 5b).
 *
 * Colour alone never carries the state: every chip has a text label, and the
 * rewarded one appends the coin amount.
 */
export interface ReferralChipSpec {
  /** `referral.json` key for the chip label. */
  labelKey: string;
  /** Tailwind classes for the chip surface, valid in all four themes. */
  className: string;
  /** Coins to append as `· +50`, or `null`. */
  coins: number | null;
}

const CHIP_STYLES: Record<ReferralInviteState, string> = {
  INVITED: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  JOINED: 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300',
  PLAYED: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
};

const CHIP_LABELS: Record<ReferralInviteState, string> = {
  INVITED: 'referral.chipInvited',
  JOINED: 'referral.chipJoined',
  PLAYED: 'referral.chipPlayed',
};

export function referralChipSpec(
  state: ReferralInviteState,
  rewardCoins: number | null,
): ReferralChipSpec {
  return {
    labelKey: CHIP_LABELS[state],
    className: CHIP_STYLES[state],
    // Only a rewarded invite shows an amount; a joined-but-unpaid one must not
    // imply coins have already landed.
    coins: state === 'PLAYED' && rewardCoins !== null && rewardCoins > 0 ? rewardCoins : null,
  };
}

/** Display name for an invite row: the invitee's name, or `null` for "Pending". */
export function referralInviteName(
  user: { firstName: string | null; lastName: string | null } | null,
): string | null {
  if (!user) return null;
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return name.length > 0 ? name : null;
}

/** Initials for the avatar fallback, or an empty string for a pending invite. */
export function referralInviteInitials(
  user: { firstName: string | null; lastName: string | null } | null,
): string {
  if (!user) return '';
  const first = user.firstName?.trim()?.charAt(0) ?? '';
  const last = user.lastName?.trim()?.charAt(0) ?? '';
  return `${first}${last}`.toUpperCase();
}
