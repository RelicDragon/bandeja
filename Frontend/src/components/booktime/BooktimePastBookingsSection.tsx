import { ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BooktimeMyClubRow } from '@/api/booktime';
import { useBooktimeAllPast } from '@/hooks/useBooktimeAllPast';
import type { ResolvedDisplaySettings } from '@/utils/displayPreferences';
import { BooktimeBookingsLoading } from './BooktimeBookingsLoading';
import { BooktimePastBookingRow } from './BooktimePastBookingRow';

type Props = {
  clubs: BooktimeMyClubRow[];
  displaySettings: ResolvedDisplaySettings;
  refreshKey?: number;
  showClubName?: boolean;
};

export function BooktimePastBookingsSection({
  clubs,
  displaySettings,
  refreshKey = 0,
  showClubName = false,
}: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const { bookings: past, loading } = useBooktimeAllPast(clubs, expanded, refreshKey);
  const clubById = useMemo(() => new Map(clubs.map((c) => [c.clubId, c])), [clubs]);

  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40 p-3">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        aria-expanded={expanded}
        onClick={() => {
          setExpanded((v) => {
            if (v) setSelectedBookingId(null);
            return !v;
          });
        }}
      >
        <span className="flex min-w-0 items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('club.booktime.pastTitle')}</h3>
          {!loading && past.length > 0 ? (
            <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-gray-900/5 px-1.5 text-[10px] font-semibold tabular-nums text-gray-600 dark:bg-white/10 dark:text-gray-300">
              {past.length}
            </span>
          ) : null}
        </span>
        <ChevronDown
          size={18}
          strokeWidth={2}
          className={`shrink-0 text-gray-500 transition-transform duration-300 ease-out motion-reduce:transition-none dark:text-gray-400 ${expanded ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pt-3">
            {loading ? (
              <BooktimeBookingsLoading />
            ) : past.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('club.booktime.noPast')}</p>
            ) : (
              <ul className="space-y-2">
                {past.map((booking) => {
                  const club = clubById.get(booking.clubId);
                  if (!club) return null;
                  const bookingId = booking.uuid;
                  return (
                    <BooktimePastBookingRow
                      key={`${booking.clubId}-${bookingId}`}
                      booking={booking}
                      club={club}
                      displaySettings={displaySettings}
                      showClubName={showClubName}
                      expandableActions
                      actionsExpanded={selectedBookingId === bookingId}
                      onToggleActions={() =>
                        setSelectedBookingId((prev) => (prev === bookingId ? null : bookingId))
                      }
                    />
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
