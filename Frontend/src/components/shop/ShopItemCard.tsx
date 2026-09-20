import { useTranslation } from 'react-i18next';
import { Check, Lock } from 'lucide-react';
import type { ShopItem } from '@/api/shop';
import { ShopItemPreview } from './ShopItemPreview';
import { ShopPricePill } from './ShopPricePill';
import { coinsPhrase } from './shopFormat';
import '@/styles/collection.css';

/**
 * PRD 355 — one storefront card.
 *
 * The whole card is the tap target (min 44 px tall by construction) and its
 * accessible name carries name, **price** and state, so the visual badges never
 * carry meaning on their own.
 *
 * The price has to be spelled out in the `aria-label` rather than left to the
 * rendered `ShopPricePill`: an `aria-label` on a `<button>` replaces its whole
 * subtree as the accessible name, so anything it omits is simply gone. Without
 * it a screen-reader user hears "Neon Frame. Buy." on every tile and cannot
 * compare prices without opening each sheet.
 */
interface ShopItemCardProps {
  item: ShopItem;
  onOpen: (item: ShopItem) => void;
  /** `featured` is the wide carousel card; `grid` is the 2-column tile. */
  variant?: 'grid' | 'featured';
}

export const ShopItemCard = ({ item, onOpen, variant = 'grid' }: ShopItemCardProps) => {
  const { t, i18n } = useTranslation();

  // Accents only read as themselves on a bubble; everything else reads on the avatar.
  const previewContext = item.kind === 'CHAT_ACCENT' ? 'chat' : 'profile';

  const stateLabel =
    item.state === 'EQUIPPED'
      ? t('shop.equipped')
      : item.state === 'OWNED'
        ? t('shop.owned')
        : item.state === 'PREMIUM_LOCKED'
          ? t('shop.premium')
          : t('shop.buy');

  const priceLabel = coinsPhrase(t, i18n.language, item.price);
  const premiumLabel = item.premiumOnly ? ` ${t('shop.premiumOnly')}.` : '';

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label={`${item.name}. ${priceLabel}.${premiumLabel} ${stateLabel}.`}
      className={`group flex w-full flex-col gap-3 rounded-2xl border bg-white p-3 text-start transition-colors dark:bg-gray-900 ${
        item.premiumOnly
          ? 'shop-premium-card border-transparent'
          : 'border-gray-200 dark:border-gray-800'
      } ${variant === 'featured' ? 'min-w-[16rem] max-w-[18rem]' : ''} hover:border-primary-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500`}
    >
      <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60">
        <ShopItemPreview
          item={item}
          context={previewContext}
          size={variant === 'featured' ? 'lg' : 'md'}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">
            {item.name}
          </span>
          {item.premiumOnly ? (
            <span className="shop-premium-badge inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold">
              <Lock size={10} aria-hidden="true" />
              {t('shop.premium')}
            </span>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2">
          <ShopPricePill amount={item.price} />
          <span
            className={`inline-flex min-h-[1.75rem] items-center gap-1 rounded-full px-2 text-xs font-semibold ${
              item.state === 'EQUIPPED'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                : item.state === 'OWNED'
                  ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                  : item.state === 'PREMIUM_LOCKED'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                    : 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200'
            }`}
          >
            {item.state === 'EQUIPPED' ? <Check size={12} aria-hidden="true" /> : null}
            {item.state === 'PREMIUM_LOCKED' ? <Lock size={12} aria-hidden="true" /> : null}
            {stateLabel}
          </span>
        </div>
      </div>
    </button>
  );
};
