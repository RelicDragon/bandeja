import { useTranslation } from 'react-i18next';
import { isCostSplitEnabled } from '@/config/featureFlags';

/** `Game.paymentHint` is `VarChar(120)` — the backend rejects anything longer. */
export const PAYMENT_HINT_MAX_LENGTH = 120;

/**
 * PRD 348 — the optional **How to pay you** field.
 *
 * Free text (IBAN, Revolut tag, "cash at the club"), shown to players at the top
 * of the settle sheet in a copyable field. The app never parses it, never
 * validates it as a bank detail, and never sends it anywhere but the game's own
 * participants: no payment provider is involved.
 */
export function PaymentHintField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  if (!isCostSplitEnabled()) return null;

  return (
    <div>
      <label
        htmlFor="game-payment-hint"
        className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400"
      >
        {t('cost.create.paymentHintLabel')}
      </label>
      <input
        id="game-payment-hint"
        type="text"
        value={value}
        maxLength={PAYMENT_HINT_MAX_LENGTH}
        onChange={(event) => onChange(event.target.value.slice(0, PAYMENT_HINT_MAX_LENGTH))}
        placeholder={t('cost.create.paymentHintPlaceholder')}
        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
      />
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {t('cost.create.paymentHintHelp', {
          remaining: PAYMENT_HINT_MAX_LENGTH - value.length,
        })}
      </p>
    </div>
  );
}
