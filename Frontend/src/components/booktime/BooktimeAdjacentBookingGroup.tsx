import { ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BooktimeMyClubRow } from '@/api/booktime';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { CourtDisplayName } from '@/components/CourtDisplayName';
import { BooktimeBookingRow } from './BooktimeBookingRow';
import {
  formatBooktimeBookingWhen,
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

  const summaryBooking = useMemo(
    () => ({
      ...bookings[0]!,
      bookingEnd: bookings[bookings.length - 1]!.bookingEnd,
    }),
    [bookings],
  );
  const courtInfo = resolveCourtForBooking(bookings[0]!, club, t('club.booktime.unknownCourt'));

  return (
    <li
      className={`rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 ${
        compact ? 'px-3 py-2' : 'px-3 py-2.5'
      }`}
    >
      <button
        type="button"
        className="flex w-full items-start gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-md"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <div className="min-w-0 flex-1">
          {showClubName ? (
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{club.clubName}</p>
          ) : null}
          <CourtDisplayName
            name={courtInfo.courtName}
            integrationName={courtInfo.integrationCourtName}
            primaryClassName="text-sm font-medium text-gray-900 dark:text-white truncate"
            secondaryClassName="text-[10px] text-gray-500 dark:text-gray-400 truncate"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {formatBooktimeBookingWhen(summaryBooking, { timezone: clubTimezone, displaySettings })}
          </p>
          <p className="text-[10px] font-medium text-primary-700 dark:text-primary-300 mt-0.5">
            {t('club.booktime.adjacentSlotsCount', { count: bookings.length })}
          </p>
        </div>
        <ChevronDown
          size={18}
          strokeWidth={2}
          className={`mt-0.5 shrink-0 text-gray-500 transition-transform duration-300 ease-out motion-reduce:transition-none dark:text-gray-400 ${
            expanded ? 'rotate-180' : ''
          }`}
          aria-hidden
        />
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
