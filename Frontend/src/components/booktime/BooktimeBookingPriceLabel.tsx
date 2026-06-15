import { useTranslation } from 'react-i18next';
import type { BooktimeBookingPriceQuote } from './booktimeBookingPrices';

type Props = {
  quote: BooktimeBookingPriceQuote | undefined;
  className?: string;
};

export function BooktimeBookingPriceLabel({ quote, className }: Props) {
  const { t } = useTranslation();

  if (!quote) return null;

  return (
    <p className={className ?? 'text-xs font-medium text-gray-700 dark:text-gray-300'}>
      {t('club.booktime.priceLabel', {
        price: quote.amount.toLocaleString(),
        currency: quote.currency,
      })}
    </p>
  );
}
