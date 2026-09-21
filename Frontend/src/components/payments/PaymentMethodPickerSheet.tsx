import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Search } from 'lucide-react';
import {
  CUSTOM_PAYMENT_METHOD_ID,
  paymentMethodsForCountry,
  type PaymentMethodDef,
} from '@shared/payments/paymentMethods';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/Drawer';
import { OverlayKeyboardBody } from '@/components/ui/OverlayKeyboardBody';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { usePaymentMethodLabels } from '@/features/cost/paymentMethodLabels';

/**
 * PRD 348 — picking *how* players pay the organiser back.
 *
 * The list is the catalogue filtered to the country the game is played in, in
 * the order a local would expect: the free-text escape hatch first, then the
 * rail people there actually use, then the cross-border wallets, then cash.
 * A Belgrade game offers IPS Prenesi and never IBAN; a Madrid one leads with
 * Bizum. Methods already on the game are shown ticked and cannot be added
 * twice.
 */
export function PaymentMethodPickerSheet({
  open,
  onOpenChange,
  countryIso2,
  selectedIds,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ISO-2 of the game's city; `null` shows only the universal methods. */
  countryIso2: string | null | undefined;
  /** Methods already on the list — ticked and not selectable again. */
  selectedIds: readonly string[];
  onSelect: (method: PaymentMethodDef) => void;
}) {
  const { t } = useTranslation();
  const { labelFor } = usePaymentMethodLabels();
  const [search, setSearch] = useState('');

  useBackButtonModal(open, () => onOpenChange(false), 'payment-method-picker');

  const methods = useMemo(() => paymentMethodsForCountry(countryIso2), [countryIso2]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return methods;
    return methods.filter((method) => labelFor(method).toLowerCase().includes(query));
    // `labelFor` is derived from the i18n instance and stable for a render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [methods, search]);

  const handlePick = (method: PaymentMethodDef) => {
    if (selectedIds.includes(method.id)) return;
    onSelect(method);
    setSearch('');
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-lg">
        <DrawerHeader className="text-start">
          <DrawerTitle>{t('cost.payment.pickerTitle')}</DrawerTitle>
          <DrawerDescription>{t('cost.payment.pickerSubtitle')}</DrawerDescription>
        </DrawerHeader>

        <OverlayKeyboardBody className="min-h-0 flex-1 overflow-y-auto px-4">
          <div className="relative mb-3">
            <Search
              size={16}
              aria-hidden
              className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('cost.payment.pickerSearch')}
              aria-label={t('cost.payment.pickerSearch')}
              className="w-full rounded-xl border border-gray-300 bg-white py-3 pe-4 ps-9 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <ul className="space-y-1.5 pb-2">
            {filtered.map((method) => {
              const already = selectedIds.includes(method.id);
              return (
                <li key={method.id}>
                  <button
                    type="button"
                    onClick={() => handlePick(method)}
                    disabled={already}
                    aria-disabled={already}
                    className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-start transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">
                        {labelFor(method)}
                      </span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">
                        {method.availability.scope === 'GLOBAL'
                          ? t('cost.payment.everywhere')
                          : t(`cost.payment.handle.${method.handle}.label`)}
                      </span>
                    </span>
                    {already ? (
                      <Check size={18} aria-hidden className="shrink-0 text-primary-500" />
                    ) : null}
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 ? (
              <li className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                {t('cost.payment.pickerEmpty')}
              </li>
            ) : null}
          </ul>

          {/* The catalogue is never complete — say so rather than let someone give up. */}
          {!selectedIds.includes(CUSTOM_PAYMENT_METHOD_ID) ? (
            <p className="pb-2 text-xs text-gray-500 dark:text-gray-400">
              {t('cost.payment.pickerCustomHint')}
            </p>
          ) : null}
        </OverlayKeyboardBody>

        <div
          className="px-4 pt-3"
          style={{ paddingBottom: 'calc(var(--overlay-bottom-inset, 0px) + 1rem)' }}
        >
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="min-h-[44px] w-full rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {t('cost.cancel')}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
