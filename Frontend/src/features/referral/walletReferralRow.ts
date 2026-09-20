/**
 * PRD 351 — wallet presentation rules for referral payouts.
 *
 * `Transaction` has no `reason` column, so the payout records its reason in
 * `TransactionRow.name` (see
 * `Backend/src/services/referral/referralCode.ts#REFERRAL_TRANSACTION_REASON`).
 * That value is written once, in whatever locale-free form the backend chose,
 * and can never be re-localized later — so the Wallet maps the machine reason
 * back to real copy at render time instead of showing `REFERRAL` to the user.
 *
 * Pure so the mapping can be tested without mounting the modal.
 */

/** Must stay byte-identical to the backend constant. */
export const REFERRAL_TRANSACTION_REASON = 'REFERRAL';

/** How long the highlighted row keeps its tint, per the PRD. */
export const WALLET_HIGHLIGHT_DURATION_MS = 1000;

/** Soft sky tint, readable in Light, Dark, Classic and Premium. */
export const WALLET_HIGHLIGHT_CLASS =
  'ring-2 ring-primary-400/70 bg-primary-50 dark:bg-primary-950/40';

const REASON_LABEL_KEYS: Record<string, string> = {
  [REFERRAL_TRANSACTION_REASON]: 'referral.walletRowLabel',
};

/**
 * `referral.json` key for a machine transaction reason, or `null` when the row
 * name is ordinary free text and should be shown as-is.
 */
export function walletTransactionLabelKey(rowName: string | undefined | null): string | null {
  if (!rowName) return null;
  return REASON_LABEL_KEYS[rowName] ?? null;
}
