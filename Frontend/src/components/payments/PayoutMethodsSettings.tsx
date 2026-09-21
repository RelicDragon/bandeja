import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  parsePaymentMethods,
  paymentMethodIssueKey,
  validatePaymentMethods,
  type PaymentMethodEntry,
} from '@shared/payments/paymentMethodSelection';
import { isCostSplitEnabled } from '@/config/featureFlags';
import { PaymentMethodsField } from './PaymentMethodsField';

/** Keep incomplete handles local until Save; profile refreshes cannot replace a draft. */
export function PayoutMethodsSettings({
  savedMethods,
  countryIso2,
  onSave,
}: {
  savedMethods: unknown;
  countryIso2: string | null | undefined;
  onSave: (methods: PaymentMethodEntry[]) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<PaymentMethodEntry[] | null>(null);
  const [saving, setSaving] = useState(false);

  if (!isCostSplitEnabled()) return null;

  const save = async () => {
    if (draft === null || saving) return;
    const result = validatePaymentMethods(draft);
    if (result.issues.length > 0) {
      toast.error(t(paymentMethodIssueKey(result.issues[0])));
      return;
    }
    setSaving(true);
    try {
      if (await onSave(result.value)) setDraft(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <fieldset disabled={saving} aria-busy={saving} className="min-w-0">
      <PaymentMethodsField
        value={draft ?? parsePaymentMethods(savedMethods)}
        onChange={setDraft}
        countryIso2={countryIso2}
        label={t('cost.payment.profileTitle')}
        help={t('cost.payment.profileHelp')}
      />
      {draft !== null && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => void save()}
            className="min-h-[44px] rounded-xl bg-primary-600 px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            {t(saving ? 'common.saving' : 'cost.save')}
          </button>
          <button
            type="button"
            onClick={() => setDraft(null)}
            className="min-h-[44px] rounded-xl px-4 text-sm font-medium text-gray-600 dark:text-gray-300"
          >
            {t('cost.cancel')}
          </button>
        </div>
      )}
    </fieldset>
  );
}
