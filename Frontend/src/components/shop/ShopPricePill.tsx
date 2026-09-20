import { useTranslation } from 'react-i18next';
import { Coins } from 'lucide-react';
import { formatCoins } from './shopFormat';

/**
 * PRD 355 — a price or balance pill.
 *
 * The icon is decorative; the pill's accessible name is the full phrase
 * ("120 coins"), never a bare number next to a picture of a coin.
 */
interface ShopPricePillProps {
  amount: number;
  tone?: 'neutral' | 'primary';
  size?: 'sm' | 'md';
  className?: string;
}

export const ShopPricePill = ({
  amount,
  tone = 'neutral',
  size = 'sm',
  className = '',
}: ShopPricePillProps) => {
  const { t, i18n } = useTranslation();
  const formatted = formatCoins(amount, i18n.language);
  const label = t('shop.coins', { count: amount, formatted });

  const toneClass =
    tone === 'primary'
      ? 'bg-primary-600 text-white'
      : 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100';
  const sizeClass = size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-2 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${toneClass} ${sizeClass} ${className}`}
      aria-label={label}
    >
      <Coins size={size === 'md' ? 16 : 14} aria-hidden="true" />
      <span aria-hidden="true">{formatted}</span>
    </span>
  );
};
