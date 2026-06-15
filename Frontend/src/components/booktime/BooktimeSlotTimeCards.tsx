import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { formatBooktimeBookingSlotRange } from './booktimeBookingUtils';
import type { BooktimeBookingPriceQuote } from './booktimeBookingPrices';

type Props = {
  bookings: BooktimeBookingRecord[];
  clubTimezone?: string | null;
  priceById?: Map<string, BooktimeBookingPriceQuote>;
};

export function BooktimeSlotTimeCards({
  bookings,
  clubTimezone,
  priceById,
}: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);

  return (
    <div className="flex flex-wrap gap-1.5">
      {bookings.map((booking) => {
        const quote = priceById?.get(booking.uuid);
        const timeRange = formatBooktimeBookingSlotRange(booking, {
          timezone: clubTimezone,
          displaySettings,
        });
        const priceLabel = quote
          ? t('club.booktime.priceLabel', {
              price: quote.amount.toLocaleString(),
              currency: quote.currency,
            })
          : null;

        return (
          <span
            key={booking.uuid}
            className="inline-flex flex-col rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/60 px-2 py-1 text-[10px] font-medium tabular-nums text-gray-700 dark:text-gray-300"
          >
            <span>{timeRange}</span>
            {priceLabel ? <span className="text-gray-500 dark:text-gray-400">{priceLabel}</span> : null}
          </span>
        );
      })}
    </div>
  );
}
