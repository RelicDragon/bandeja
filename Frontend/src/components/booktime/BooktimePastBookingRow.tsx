import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { BooktimeMyClubRow } from '@/api/booktime';
import { CourtDisplayName } from '@/components/CourtDisplayName';
import type { AggregatedBooktimeBooking } from '@/hooks/useBooktimeAllUpcoming';
import { useBooktimeLinkedGame } from '@/hooks/useBooktimeLinkedGame';
import type { ResolvedDisplaySettings } from '@/utils/displayPreferences';
import { BooktimeBookingPriceLabel } from './BooktimeBookingPriceLabel';
import { BooktimeLinkedGameLink } from './BooktimeLinkedGameLink';
import { BooktimeLinkGameButton } from './BooktimeLinkGameModal';
import { bookingPriceQuote } from './booktimeBookingPrices';
import { formatBooktimeBookingWhen, resolveBooktimeMyClubTimezone, resolveCourtForBooking } from './booktimeBookingUtils';
import { useBooktimeClubCurrency } from './useBooktimeClubCurrency';

type Props = {
  booking: AggregatedBooktimeBooking;
  club: BooktimeMyClubRow;
  displaySettings: ResolvedDisplaySettings;
  showClubName?: boolean;
};

export function BooktimePastBookingRow({ booking, club, displaySettings, showClubName = false }: Props) {
  const { t } = useTranslation();
  const { linkedGame, reload: reloadLinkedGame } = useBooktimeLinkedGame(booking.uuid);
  const courtInfo = resolveCourtForBooking(booking, club, t('club.booktime.unknownCourt'));
  const currency = useBooktimeClubCurrency(club);
  const priceQuote = useMemo(
    () => bookingPriceQuote(booking, currency ?? ''),
    [booking, currency],
  );

  return (
    <li className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-600 dark:text-gray-300">
      {showClubName ? (
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate mb-0.5">{booking.clubName}</p>
      ) : null}
      <CourtDisplayName
        name={courtInfo.courtName}
        integrationName={courtInfo.integrationCourtName}
        primaryClassName="font-medium text-gray-900 dark:text-white"
        secondaryClassName="text-[10px] text-gray-500 dark:text-gray-400"
      />
      <span className="block text-xs text-gray-500 mt-0.5">
        {formatBooktimeBookingWhen(booking, {
          timezone: resolveBooktimeMyClubTimezone(club),
          displaySettings,
        })}
      </span>
      <BooktimeBookingPriceLabel quote={priceQuote} />
      {linkedGame ? <BooktimeLinkedGameLink game={linkedGame} /> : null}
      {!linkedGame ? (
        <div className="mt-2">
          <BooktimeLinkGameButton
            booking={booking}
            club={club}
            compact
            onLinked={() => void reloadLinkedGame()}
          />
        </div>
      ) : null}
    </li>
  );
}
