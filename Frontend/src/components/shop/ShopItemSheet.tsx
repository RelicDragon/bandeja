import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Gift, HelpCircle, Lock } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerCloseButton,
} from '@/components/ui/Drawer';
import { OverlayKeyboardBody } from '@/components/ui/OverlayKeyboardBody';
import { Button } from '@/components/Button';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { shopApi, type ShopItem } from '@/api/shop';
import { ShopGiftPickerSheet } from './ShopGiftPickerSheet';
import { giftRecipientName } from './giftCandidates';
import { ShopRotatingPreview } from './ShopRotatingPreview';
import { ShopPricePill } from './ShopPricePill';
import { ShopPurchaseConfirmDialog } from './ShopPurchaseConfirmDialog';
import {
  canAfford,
  coinsPhrase,
  coinsShortfall,
  formatCoins,
  isEquippableKind,
  purchaseErrorKey,
} from './shopFormat';
import '@/styles/collection.css';

/**
 * PRD 355 — the item sheet.
 *
 * Owns the whole buy / gift / equip interaction for one item so the storefront
 * page stays a list. A purchase failure keeps the confirm dialog open with an
 * inline error and asks the page to re-read the balance.
 */
interface ShopItemSheetProps {
  item: ShopItem | null;
  balance: number;
  onClose: () => void;
  /** The catalogue changed (bought, equipped, gifted) — refetch upstream. */
  onChanged: (nextBalance?: number) => void;
}

type PendingPurchase = { recipientUserId: string | null; recipientName: string | null };

function readRejectionReason(error: unknown): string | undefined {
  const response = (error as { response?: { data?: { reason?: unknown } } }).response;
  const reason = response?.data?.reason;
  return typeof reason === 'string' ? reason : undefined;
}

export const ShopItemSheet = ({ item, balance, onClose, onChanged }: ShopItemSheetProps) => {
  const { t, i18n } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const open = item !== null;

  const [pending, setPending] = useState<PendingPurchase | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const [showEarnHint, setShowEarnHint] = useState(false);
  const [shine, setShine] = useState(false);

  useBackButtonModal(open && !pending && !showGiftPicker, onClose, 'shop-item-sheet');

  useEffect(() => {
    if (!open) {
      setPending(null);
      setErrorKey(null);
      setShowGiftPicker(false);
      setShowEarnHint(false);
      setShine(false);
    }
  }, [open, item?.id]);

  if (!item) return null;

  const shortfall = coinsShortfall(balance, item.price);
  const affordable = canAfford(balance, item.price);
  const locked = item.state === 'PREMIUM_LOCKED';

  const runPurchase = async () => {
    if (!pending) return;
    setSubmitting(true);
    setErrorKey(null);
    try {
      const result = await shopApi.purchase(item.id, pending.recipientUserId ?? undefined);
      setPending(null);
      if (!reducedMotion) {
        setShine(true);
        window.setTimeout(() => setShine(false), 600);
      }
      toast.success(
        pending.recipientUserId
          ? t('shop.giftSentToast', { recipient: pending.recipientName ?? '' })
          : t('shop.addedToCollection'),
      );
      onChanged(result.balance);
    } catch (error) {
      // Keep the dialog open: the player must see why nothing was spent.
      setErrorKey(purchaseErrorKey(readRejectionReason(error)));
      onChanged();
    } finally {
      setSubmitting(false);
    }
  };

  const toggleEquip = async () => {
    setSubmitting(true);
    try {
      if (item.equipped) {
        await shopApi.unequip(item.id);
        toast.success(t('shop.unequippedToast'));
      } else {
        await shopApi.equip(item.id);
        toast.success(t('shop.equippedToast'));
      }
      onChanged();
    } catch {
      toast.error(t('shop.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  // A sticker pack is unlocked by ownership, so there is nothing to equip: the
  // sheet states that instead of offering a button that does nothing.
  const equippable = isEquippableKind(item.kind);
  const primaryLabel = item.equipped
    ? t('shop.unequip')
    : item.owned
      ? t('shop.equip')
      : locked
        ? t('shop.premiumLocked')
        : affordable
          ? t('shop.buyFor', { amount: coinsPhrase(t, i18n.language, item.price) })
          : t('shop.needMoreCoins', {
              count: shortfall,
              formatted: formatCoins(shortfall, i18n.language),
            });

  return (
    <>
      <Drawer open={open && !showGiftPicker} onOpenChange={(next) => (next ? undefined : onClose())}>
        <DrawerContent accessibleTitle={item.name}>
          <DrawerHeader className="flex items-start justify-between gap-3 text-start">
            <div className="flex min-w-0 flex-col gap-1">
              <DrawerTitle className="truncate">{item.name}</DrawerTitle>
              {item.premiumOnly ? (
                <span className="shop-premium-badge inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold">
                  <Lock size={11} aria-hidden="true" />
                  {t('shop.premiumOnly')}
                </span>
              ) : null}
            </div>
            <DrawerCloseButton onClick={onClose} />
          </DrawerHeader>

          <OverlayKeyboardBody>
            <div className="flex flex-col gap-4 px-4 pb-4">
              <ShopRotatingPreview
                item={item}
                paused={pending !== null}
                className={shine ? 'shop-shine' : ''}
              />

              {item.description ? (
                <p className="text-sm text-gray-600 dark:text-gray-300">{item.description}</p>
              ) : null}

              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-300">{t('shop.price')}</span>
                <ShopPricePill amount={item.price} size="md" />
              </div>

              {!item.owned && !affordable && !locked ? (
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => setShowEarnHint((value) => !value)}
                    aria-expanded={showEarnHint}
                    className="inline-flex min-h-[44px] items-center gap-1.5 self-start text-sm font-medium text-primary-600 dark:text-primary-400"
                  >
                    <HelpCircle size={15} aria-hidden="true" />
                    {t('shop.howToEarnCoins')}
                  </button>
                  {showEarnHint ? (
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      {t('shop.howToEarnCoinsDetail')}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </OverlayKeyboardBody>

          <div
            className="flex flex-col gap-2 border-t border-gray-200 px-4 pt-3 dark:border-gray-700"
            style={{ paddingBottom: 'calc(0.75rem + var(--overlay-bottom-inset, 0px))' }}
          >
            {item.owned && !equippable ? (
              <p
                className="flex min-h-[44px] items-center justify-center rounded-xl bg-gray-100 px-4 text-sm font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200"
                data-testid="shop-item-unlocked"
              >
                {t('shop.stickerPackUnlocked')}
              </p>
            ) : (
              <Button
                onClick={
                  item.owned
                    ? toggleEquip
                    : () => setPending({ recipientUserId: null, recipientName: null })
                }
                disabled={submitting || locked || (!item.owned && !affordable)}
                className="min-h-[44px] w-full"
              >
                {primaryLabel}
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => setShowGiftPicker(true)}
              disabled={submitting}
              className="min-h-[44px] w-full"
            >
              <Gift size={16} className="me-2" aria-hidden="true" />
              {t('shop.giftToFriend')}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      <ShopGiftPickerSheet
        open={showGiftPicker}
        onClose={() => setShowGiftPicker(false)}
        onPick={(user) => {
          setShowGiftPicker(false);
          setPending({ recipientUserId: user.id, recipientName: giftRecipientName(user) });
        }}
      />

      <ShopPurchaseConfirmDialog
        open={pending !== null}
        item={item}
        balance={balance}
        recipientName={pending?.recipientName ?? null}
        submitting={submitting}
        errorKey={errorKey}
        onConfirm={runPurchase}
        onClose={() => {
          setPending(null);
          setErrorKey(null);
        }}
      />
    </>
  );
};
