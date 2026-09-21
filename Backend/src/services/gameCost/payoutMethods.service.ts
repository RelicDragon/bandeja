import {
  parsePaymentMethods,
  type PaymentMethodEntry,
} from '@bandeja/shared/payments/paymentMethodSelection';
import prisma from '../../config/database';

/**
 * PRD 348 — the organiser's saved "how to pay me" list (`User.payoutMethods`).
 *
 * Prefilled onto every game they create, so a Bizum number or an IPS Prenesi
 * phone is typed once rather than every Tuesday. Each game keeps its own copy:
 * editing the profile later never rewrites a game whose players have already
 * read the old details.
 *
 * Private. It leaves the API only on the owner's own settings payload, and via
 * the games they attached it to — where the existing entitlement gate already
 * limits it to that game's participants.
 */

export async function loadUserPayoutMethods(userId: string): Promise<PaymentMethodEntry[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { payoutMethods: true },
  });
  return parsePaymentMethods(user?.payoutMethods ?? null);
}
