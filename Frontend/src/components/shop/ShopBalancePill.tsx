import { useTranslation } from 'react-i18next';
import { Coins } from 'lucide-react';
import { CountUpNumber } from '@/components/ui/CountUpNumber';
import { coinsPhrase } from './shopFormat';

/**
 * PRD 355 — the shop's balance pill.
 *
 * Counts down when a purchase settles (≤600 ms, and instant under reduced
 * motion — `CountUpNumber` owns that rule). The live region announces the new
 * balance once, not every animation frame.
 */
interface ShopBalancePillProps {
  balance: number;
  className?: string;
}

export const ShopBalancePill = ({ balance, className = '' }: ShopBalancePillProps) => {
  const { t, i18n } = useTranslation();
  const label = t('shop.balanceLabel', { amount: coinsPhrase(t, i18n.language, balance) });

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-900 dark:bg-gray-800 dark:text-gray-100 ${className}`}
      title={label}
    >
      <Coins size={16} aria-hidden="true" className="text-amber-500" />
      <span aria-hidden="true">
        <CountUpNumber value={balance} />
      </span>
      <span className="sr-only" aria-live="polite">
        {label}
      </span>
    </span>
  );
};
