import { useTranslation } from 'react-i18next';
import { AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/Button';
import type { ShopItem } from '@/api/shop';
import { ShopPricePill } from './ShopPricePill';
import { balanceAfter, coinsPhrase, coinsShortfall } from './shopFormat';

/**
 * PRD 355 — "Buy Neon Frame for 120 coins? Balance after: 380".
 *
 * A mis-tap must never spend coins, so this confirm step is mandatory for both
 * buying and gifting. On failure the dialog **stays open** with an inline error
 * and the caller re-fetches the balance, so the player can see what changed
 * before trying again.
 */
interface ShopPurchaseConfirmDialogProps {
  open: boolean;
  item: ShopItem | null;
  balance: number;
  /** Set when this is a gift; shows "Gift X to Ana for N coins". */
  recipientName?: string | null;
  submitting: boolean;
  /** i18n key of the inline error, or `null`. */
  errorKey: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export const ShopPurchaseConfirmDialog = ({
  open,
  item,
  balance,
  recipientName,
  submitting,
  errorKey,
  onConfirm,
  onClose,
}: ShopPurchaseConfirmDialogProps) => {
  const { t, i18n } = useTranslation();
  if (!item) return null;

  const shortfall = coinsShortfall(balance, item.price);
  const affordable = shortfall === 0;
  const after = balanceAfter(balance, item.price);

  const priceAmount = coinsPhrase(t, i18n.language, item.price);
  const question = recipientName
    ? t('shop.confirmGiftQuestion', { name: item.name, recipient: recipientName, amount: priceAmount })
    : t('shop.confirmQuestion', { name: item.name, amount: priceAmount });

  return (
    <Dialog open={open} onClose={onClose} modalId="shop-purchase-confirm">
      <DialogContent className="max-w-[360px]">
        <DialogHeader>
          <DialogTitle>{t('shop.confirmTitle')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 p-4">
          <p className="text-sm text-gray-700 dark:text-gray-200">{question}</p>

          <div className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-800/60">
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {t('shop.balanceAfter')}
            </span>
            <ShopPricePill amount={after} />
          </div>

          {errorKey ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200"
            >
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
              {t(errorKey)}
            </p>
          ) : null}

          {!affordable && !errorKey ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {t('shop.needMoreCoinsDetail', {
                amount: coinsPhrase(t, i18n.language, shortfall),
              })}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Button
              onClick={onConfirm}
              disabled={!affordable || submitting}
              className="min-h-[44px] w-full"
            >
              {submitting ? t('shop.purchasing') : t('shop.confirm')}
            </Button>
            <Button variant="secondary" onClick={onClose} className="min-h-[44px] w-full">
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
