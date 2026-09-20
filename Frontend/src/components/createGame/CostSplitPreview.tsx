import { useTranslation } from 'react-i18next';
import type { PriceCurrency, PriceType } from '@/types';
import { formatCostMinor, perHeadPreviewMinor } from '@/features/cost/costMoney';
import { isCostSplitEnabled } from '@/config/featureFlags';

/**
 * PRD 348 — "≈ 10 € each for 4 players" under the price field.
 *
 * Live: it re-reads `maxParticipants` on every keystroke of the seat count, so
 * the organizer sees what each player will owe before the game exists. Purely
 * informational — nothing is stored from here.
 */

export function CostSplitPreview({
  priceType,
  priceTotal,
  currency,
  players,
}: {
  priceType: PriceType;
  priceTotal: number | undefined;
  currency: PriceCurrency;
  players: number;
}) {
  const { t, i18n } = useTranslation();
  if (!isCostSplitEnabled()) return null;

  const perHead = perHeadPreviewMinor(priceType, priceTotal, currency, players);
  if (perHead == null) return null;

  return (
    <p className="text-xs text-gray-500 dark:text-gray-400" role="status">
      {t('cost.create.preview', {
        amount: formatCostMinor(perHead, currency, i18n.language),
        players,
      })}
    </p>
  );
}
