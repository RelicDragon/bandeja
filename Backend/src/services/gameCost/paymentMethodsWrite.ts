import { Prisma, type PriceType } from '@prisma/client';
import { CUSTOM_PAYMENT_METHOD_ID } from '@bandeja/shared/payments/paymentMethods';
import {
  formatPaymentMethodsSummary,
  paymentMethodIssueKey,
  validatePaymentMethods,
  type PaymentMethodEntry,
} from '@bandeja/shared/payments/paymentMethodSelection';
import { ApiError } from '../../utils/ApiError';
import { isCostSplitPriceType } from './costShareMath';

/**
 * PRD 348 — the single place a payment-method list is turned into columns.
 *
 * Every writer (game create, game update, the cost-shares endpoint, the user's
 * own payout defaults) goes through here, so the legacy `Game.paymentHint`
 * mirror can never drift from the structured list it summarises. Older app
 * builds read only the mirror; keeping it correct is what stops their settle
 * sheet going blank.
 */

export interface PaymentMethodColumns {
  paymentMethods: Prisma.InputJsonValue | typeof Prisma.DbNull;
  /** The one-line summary older clients read. */
  paymentHint: string | null;
}

/** Throws a 400 naming the first problem; returns the cleaned list otherwise. */
export function parsePaymentMethodsOrThrow(raw: unknown): PaymentMethodEntry[] {
  const { value, issues } = validatePaymentMethods(raw);
  if (issues.length > 0) throw new ApiError(400, paymentMethodIssueKey(issues[0]));
  return value;
}

/**
 * Columns for a validated list. An empty list clears both, so "remove my IBAN"
 * really removes it rather than leaving the mirror behind.
 */
export function paymentMethodColumns(entries: readonly PaymentMethodEntry[]): PaymentMethodColumns {
  if (entries.length === 0) {
    return { paymentMethods: Prisma.DbNull, paymentHint: null };
  }
  return {
    paymentMethods: entries as unknown as Prisma.InputJsonValue,
    paymentHint: formatPaymentMethodsSummary(entries),
  };
}

/**
 * May a game created without any payment details inherit the organiser's saved
 * ones?
 *
 * Only where a cost split can exist. An EVENT is a public listing whose
 * "price" is a ticket paid through an external registration URL, and a free or
 * price-unknown game has nothing to settle — prefilling either would put the
 * organiser's personal bank details somewhere they never chose to put them,
 * visible to that listing's whole roster. The prefill is a convenience; it
 * never invents a reason for those details to exist.
 */
export function shouldPrefillPayoutMethods(input: {
  entityType: string | null | undefined;
  priceType: PriceType | null | undefined;
}): boolean {
  if (input.entityType === 'EVENT') return false;
  return isCostSplitPriceType(input.priceType);
}

/**
 * What a writer should apply for one request.
 *
 * `paymentMethods` wins when a client sends both — a pre-catalogue client sends
 * only `paymentHint`, and it becomes the single `CUSTOM` entry it always was.
 * `undefined` for both means "leave the columns alone".
 */
export function resolvePaymentMethodWrite(input: {
  paymentMethods?: unknown;
  paymentHint?: string | null;
}): PaymentMethodColumns | undefined {
  if (input.paymentMethods !== undefined) {
    if (input.paymentMethods === null) return paymentMethodColumns([]);
    return paymentMethodColumns(parsePaymentMethodsOrThrow(input.paymentMethods));
  }
  if (input.paymentHint !== undefined) {
    const hint = (input.paymentHint ?? '').trim();
    if (!hint) return paymentMethodColumns([]);
    // Validated rather than truncated: a hint that no longer fits is a 400, the
    // same answer the free-text field gave before the catalogue existed.
    return paymentMethodColumns(
      parsePaymentMethodsOrThrow([{ method: CUSTOM_PAYMENT_METHOD_ID, handle: hint }]),
    );
  }
  return undefined;
}
