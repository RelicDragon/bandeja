import { useTranslation } from 'react-i18next';
import {
  PAYMENT_HANDLE_RULES,
  getPaymentMethod,
  type PaymentHandleKind,
  type PaymentMethodDef,
} from '@shared/payments/paymentMethods';

/**
 * PRD 348 — naming a payment method in the viewer's language.
 *
 * Brands are not translated. "Bizum" is Bizum in Arabic and in Thai; localising
 * a brand only makes it unrecognisable to the person looking for it in the
 * list. Only the generic entries — cash, a bank transfer, "something else" —
 * carry an i18n key, and those are the ones a locale genuinely renames.
 */

export function usePaymentMethodLabels() {
  const { t } = useTranslation();

  const labelFor = (method: PaymentMethodDef | undefined): string => {
    if (!method) return '';
    if (method.brand) return method.brand;
    return t(`cost.payment.method.${method.labelKey}`);
  };

  const labelForId = (id: string): string => labelFor(getPaymentMethod(id));

  /** What the handle field is called — "Phone number", "IBAN", "Username". */
  const handleLabel = (kind: PaymentHandleKind): string => t(`cost.payment.handle.${kind}.label`);

  /**
   * A format example from the catalogue where one exists, and a translated
   * prose hint where it does not: `TEXT` and `ALIAS` accept anything, so the
   * only useful placeholder is a sentence ("Cash at the club, an IBAN,
   * anything"), and that really does need a locale.
   */
  const handlePlaceholder = (kind: PaymentHandleKind): string =>
    PAYMENT_HANDLE_RULES[kind].example || t(`cost.payment.handle.${kind}.placeholder`);

  return { labelFor, labelForId, handleLabel, handlePlaceholder };
}
