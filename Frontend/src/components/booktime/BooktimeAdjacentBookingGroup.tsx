import { ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BooktimeMyClubRow } from '@/api/booktime';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { CourtDisplayName } from '@/components/CourtDisplayName';
import { BooktimeBookingRow } from './BooktimeBookingRow';
import { BooktimeBookingPriceLabel } from './BooktimeBookingPriceLabel';
import { BooktimeSlotTimeCards } from './BooktimeSlotTimeCards';
import { buildBooktimePriceById, sumBooktimeBookingPrices } from './booktimeBookingPrices';
import { useBooktimeClubCurrency } from './useBooktimeClubCurrency';
import {
  formatBooktimeBookingsCombinedWhen,
  resolveCourtForBooking,
} from './booktimeBookingUtils';

type Props = {
  bookings: BooktimeBookingRecord[];
  club: BooktimeMyClubRow;
  showClubName?: boolean;
  allowedHoursToCancel?: number;
  compact?: boolean;
  clubTimezone?: string | null;
  onCanceled?: (bookingId: string) => void;
  onRefreshSnapshot?: (options?: { force?: boolean }) => Promise<boolean>;
};

export function BooktimeAdjacentBookingGroup({
  bookings,
  club,
  showClubName = false,
  allowedHoursToCancel = 12,
  compact = false,
  clubTimezone,
  onCanceled,
  onRefreshSnapshot,
}: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);
  const [expanded, setExpanded] = useState(false);
  const courtInfo = resolveCourtForBooking(bookings[0]!, club, t('club.booktime.unknownCourt'));
  const currency = useBooktimeClubCurrency(club);
  const priceById = useMemo(
    () => (currency ? buildBooktimePriceById(bookings, currency) : new Map()),
    [bookings, currency],
  );
  const totalPrice = useMemo(
    () => (currency ? sumBooktimeBookingPrices(bookings, currency) : null),
    [bookings, currency],
  );
  const whenLabel = formatBooktimeBookingsCombinedWhen(bookings, {
    timezone: clubTimezone,
    displaySettings,
  });

  return (
    <li
      className={`rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 ${
        compact ? 'px-3 py-2' : 'px-3 py-2.5'
      }`}
    >
      <button
        type="button"
        className="relative w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-md"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <div className="pointer-events-none absolute top-0 right-0 flex flex-col items-end">
          <BooktimeBookingPriceLabel
            quote={totalPrice}
            className="text-right text-xs font-medium text-gray-700 dark:text-gray-300"
          />
          <ChevronDown
            size={18}
            strokeWidth={2}
            className={`mt-0.5 text-gray-500 transition-transform duration-300 ease-out motion-reduce:transition-none dark:text-gray-400 ${
              expanded ? 'rotate-180' : ''
            }`}
            aria-hidden
          />
        </div>

        <div className="min-w-0 pr-14">
          {showClubName ? (
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{club.clubName}</p>
          ) : null}
          <CourtDisplayName
            name={courtInfo.courtName}
            integrationName={courtInfo.integrationCourtName}
            primaryClassName="text-sm font-medium text-gray-900 dark:text-white truncate"
            secondaryClassName="text-[10px] text-gray-500 dark:text-gray-400 truncate"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">{whenLabel}</p>
          <div
            className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
              expanded ? 'grid-rows-[0fr] opacity-0 pointer-events-none' : 'grid-rows-[1fr] opacity-100'
            }`}
            aria-hidden={expanded}
          >
            <div className={`min-h-0 overflow-hidden ${compact ? 'pt-1' : 'pt-1.5'}`}>
              <BooktimeSlotTimeCards bookings={bookings} clubTimezone={clubTimezone} />
            </div>
          </div>
        </div>
      </button>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
          expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <ul className={`space-y-2 ${compact ? 'pt-2' : 'pt-2.5'}`}>
            {bookings.map((booking) => (
              <BooktimeBookingRow
                key={booking.uuid}
                booking={booking}
                club={club}
                allowedHoursToCancel={allowedHoursToCancel}
                compact={compact}
                clubTimezone={clubTimezone}
                nested
                priceQuote={priceById.get(booking.uuid) ?? null}
                onRefreshSnapshot={onRefreshSnapshot}
                onCanceled={() => onCanceled?.(booking.uuid)}
              />
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
}
