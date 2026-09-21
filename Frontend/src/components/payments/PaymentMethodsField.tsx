import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import {
  PAYMENT_HANDLE_RULES,
  getPaymentMethod,
  type PaymentMethodDef,
} from '@shared/payments/paymentMethods';
import {
  MAX_PAYMENT_METHODS,
  type PaymentMethodEntry,
} from '@shared/payments/paymentMethodSelection';
import { isCostSplitEnabled } from '@/config/featureFlags';
import { usePaymentMethodLabels } from '@/features/cost/paymentMethodLabels';
import { PaymentMethodPickerSheet } from '@/components/payments/PaymentMethodPickerSheet';

/**
 * PRD 348 — the organiser's "How to pay you" editor.
 *
 * Up to {@link MAX_PAYMENT_METHODS} rows, each a catalogue method plus the one
 * thing the payer needs: a phone number for Bizum or IPS Prenesi, a tag for
 * Revolut, an IBAN, or free text for anything the catalogue does not know.
 *
 * The picker is filtered by `countryIso2` so a Serbian game never offers an
 * IBAN and a Thai one never offers Revolut — but nothing here rejects a method
 * that is foreign to the country: a visiting organiser really may want their
 * own country's rail, and the API does not veto it either.
 */
export function PaymentMethodsField({
  value,
  onChange,
  countryIso2,
  label,
  help,
}: {
  value: readonly PaymentMethodEntry[];
  onChange: (value: PaymentMethodEntry[]) => void;
  countryIso2: string | null | undefined;
  /** Overrides the default "How to pay you" heading (the profile screen retitles it). */
  label?: string;
  help?: string;
}) {
  const { t } = useTranslation();
  const { labelForId, handleLabel, handlePlaceholder } = usePaymentMethodLabels();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Same gate the free-text field carried: flag off, nothing rendered.
  if (!isCostSplitEnabled()) return null;

  const selectedIds = value.map((entry) => entry.method);
  const canAdd = value.length < MAX_PAYMENT_METHODS;

  const addMethod = (method: PaymentMethodDef) => {
    if (!canAdd || selectedIds.includes(method.id)) return;
    onChange([...value, { method: method.id, handle: null }]);
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const setHandleAt = (index: number, handle: string) => {
    onChange(value.map((entry, i) => (i === index ? { ...entry, handle } : entry)));
  };

  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
        {label ?? t('cost.payment.title')}
      </span>

      <ul className="space-y-2">
        {value.map((entry, index) => {
          const method = getPaymentMethod(entry.method);
          const kind = method?.handle ?? 'TEXT';
          const rules = PAYMENT_HANDLE_RULES[kind];
          const inputId = `payment-method-handle-${index}`;
          return (
            <li
              key={entry.method}
              className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-white">
                  {labelForId(entry.method)}
                </span>
                <button
                  type="button"
                  onClick={() => removeAt(index)}
                  aria-label={t('cost.payment.remove', { method: labelForId(entry.method) })}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                >
                  <X size={18} aria-hidden />
                </button>
              </div>

              {kind === 'NONE' ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('cost.payment.noHandleNeeded')}
                </p>
              ) : (
                <>
                  <label
                    htmlFor={inputId}
                    className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                  >
                    {handleLabel(kind)}
                  </label>
                  <input
                    id={inputId}
                    type="text"
                    inputMode={rules.inputMode}
                    value={entry.handle ?? ''}
                    maxLength={rules.maxLength}
                    onChange={(event) =>
                      setHandleAt(index, event.target.value.slice(0, rules.maxLength))
                    }
                    placeholder={handlePlaceholder(kind)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                  />
                </>
              )}
            </li>
          );
        })}
      </ul>

      {canAdd ? (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <Plus size={16} aria-hidden />
          {value.length === 0 ? t('cost.payment.addFirst') : t('cost.payment.add')}
        </button>
      ) : (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {t('cost.payment.maxReached', { max: MAX_PAYMENT_METHODS })}
        </p>
      )}

      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {help ?? t('cost.payment.help')}
      </p>

      <PaymentMethodPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        countryIso2={countryIso2}
        selectedIds={selectedIds}
        onSelect={addMethod}
      />
    </div>
  );
}
