import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Check, Coins, Copy, ExternalLink, HandCoins } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/Drawer';
import { OverlayKeyboardBody } from '@/components/ui/OverlayKeyboardBody';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import type { CostShareMethod, GameCostSummary } from '@/api/gameCost';
import { paymentMethodLink } from '@shared/payments/paymentMethods';
import { resolvePaymentMethods } from '@shared/payments/paymentMethodSelection';
import { usePaymentMethodLabels } from '@/features/cost/paymentMethodLabels';
import { formatCostMinor } from '@/features/cost/costMoney';
import { canOfferCoinSettlement } from '@/features/cost/costViewModel';

/**
 * PRD 348 — "How did you pay?".
 *
 * Two branches and no third: **Outside the app**, which only records the claim,
 * and **Send N coins**, which runs the existing in-app P2P `TRANSFER` to the
 * payer. No card payment, no payment provider — the app never moves real money.
 *
 * The coin branch is hidden unless the platform coin rate is set *and* the
 * viewer can actually afford it, so an unaffordable button is never shown.
 */

export function CostSettleSheet({
  open,
  onOpenChange,
  summary,
  pending,
  onSettle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: GameCostSummary;
  pending: boolean;
  onSettle: (method: CostShareMethod) => void;
}) {
  const { t, i18n } = useTranslation();
  const { labelForId } = usePaymentMethodLabels();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useBackButtonModal(open, () => onOpenChange(false), 'cost-settle-sheet');

  const share = summary.viewerShare;
  const currency = summary.currency;
  const coinOffer = canOfferCoinSettlement(summary);
  const payerName = summary.payer
    ? `${summary.payer.firstName ?? ''} ${summary.payer.lastName ?? ''}`.trim()
    : '';

  /**
   * PRD 348 — the payer's methods, falling back to the legacy free-text hint
   * for a game written before the catalogue.
   */
  const payerMethods = resolvePaymentMethods(summary.paymentMethods, summary.paymentHint);

  const handleCopy = async (methodId: string, handle: string) => {
    try {
      await navigator.clipboard.writeText(handle);
      setCopiedId(methodId);
      toast.success(t('cost.sheet.copied'));
      window.setTimeout(() => setCopiedId((id) => (id === methodId ? null : id)), 2000);
    } catch {
      toast.error(t('cost.errors.copyFailed'));
    }
  };

  if (!share || !currency) return null;

  const amountLabel = formatCostMinor(share.amountMinor, currency, i18n.language);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-lg">
        <DrawerHeader className="text-start">
          <DrawerTitle>{t('cost.sheet.title')}</DrawerTitle>
          <DrawerDescription>
            {t('cost.sheet.subtitle', { amount: amountLabel, name: payerName })}
          </DrawerDescription>
        </DrawerHeader>

        <OverlayKeyboardBody className="min-h-0 flex-1 overflow-y-auto px-4">
          {payerMethods.length > 0 ? (
            <div className="mb-4 space-y-2">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {t('cost.sheet.hintLabel', { name: payerName })}
              </p>
              {payerMethods.map((entry) => {
                const link = paymentMethodLink(entry.method, entry.handle);
                return (
                  <div
                    key={entry.method}
                    className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/60"
                  >
                    <p className="mb-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                      {labelForId(entry.method)}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 break-words text-sm text-gray-900 dark:text-gray-100">
                        {entry.handle ?? t('cost.payment.noHandleNeeded')}
                      </p>
                      {link ? (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={t('cost.payment.open')}
                          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
                        >
                          <ExternalLink size={18} aria-hidden />
                        </a>
                      ) : null}
                      {entry.handle ? (
                        <button
                          type="button"
                          onClick={() => handleCopy(entry.method, entry.handle as string)}
                          aria-label={t('cost.sheet.copy')}
                          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
                        >
                          {copiedId === entry.method ? (
                            <Check size={18} aria-hidden />
                          ) : (
                            <Copy size={18} aria-hidden />
                          )}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="space-y-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => onSettle('MANUAL')}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-start transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
            >
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-300">
                <HandCoins size={20} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-gray-900 dark:text-white">
                  {t('cost.sheet.outside')}
                </span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">
                  {t('cost.sheet.outsideHint')}
                </span>
              </span>
            </button>

            {coinOffer.available ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => onSettle('COINS')}
                className="flex min-h-[44px] w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-start transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
                  <Coins size={20} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-gray-900 dark:text-white">
                    {t('cost.sheet.coins', { coins: coinOffer.coins })}
                  </span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    {t('cost.sheet.coinsHint', { balance: coinOffer.balance })}
                  </span>
                </span>
              </button>
            ) : null}
          </div>

          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
            {t('cost.sheet.disclaimer')}
          </p>
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
