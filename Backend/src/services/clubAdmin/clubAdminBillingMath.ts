import type { ChargeStatus } from '@bandeja/shared/clubAdmin/contract';

/**
 * Charge status (pure). WAIVED and VOID are explicit decisions and stick; otherwise the status
 * follows the money: paid >= amount → PAID (a 0 charge is PAID), some paid → PARTIAL, else UNPAID.
 * `paidCents` counts non-voided payments only.
 */
export function deriveChargeStatus(current: ChargeStatus, amountCents: number, paidCents: number): ChargeStatus {
  if (current === 'WAIVED' || current === 'VOID') return current;
  if (paidCents >= amountCents) return 'PAID';
  if (paidCents > 0) return 'PARTIAL';
  return 'UNPAID';
}

/** What is still owed. WAIVED / VOID / PAID owe nothing. */
export function chargeBalanceCents(status: ChargeStatus, amountCents: number, paidCents: number): number {
  if (status === 'WAIVED' || status === 'VOID') return 0;
  return Math.max(0, amountCents - paidCents);
}
