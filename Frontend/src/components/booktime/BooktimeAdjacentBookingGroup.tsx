import { ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Variants } from 'framer-motion';
import type { BookingListClubRow } from '@/hooks/connectedBookingClubs';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { useBooktimeLinkedGamesByBookingIds } from '@/hooks/useBooktimeLinkedGamesByBookingIds';
import { linkedGamesBookingGroupSlotSegments } from '@/services/gameBooking/linkBookingToGame';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { CourtDisplayName } from '@/components/CourtDisplayName';
import { BooktimeAdjacentHourPicker } from './BooktimeAdjacentHourPicker';
import { BooktimeBookingRow } from './BooktimeBookingRow';
import { BooktimeBookingListItem } from './BooktimeBookingListItem';
import { BooktimeBookingOccupancyPill } from './BooktimeBookingOccupancyPill';
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
  club: BookingListClubRow;
  showClubName?: boolean;
  allowedHoursToCancel?: number;
  compact?: boolean;
  clubTimezone?: string | null;
  onCanceled?: (bookingId: string) => void;
  onRefreshSnapshot?: (options?: { force?: boolean }) => Promise<boolean>;
  selectable?: boolean;
  selectedBookingIds?: readonly string[];
  onToggleBooking?: (bookingId: string) => void;
  selectionMax?: number;
  expandableActions?: boolean;
  actionsExpanded?: boolean;
  onToggleActions?: () => void;
  entryVariants?: Variants;
  nested?: boolean;
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
  selectable = false,
  selectedBookingIds = [],
  onToggleBooking,
  selectionMax = Number.POSITIVE_INFINITY,
  expandableActions = false,
  actionsExpanded = false,
  onToggleActions,
  entryVariants,
  nested = false,
}: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);
  const [expanded, setExpanded] = useState(false);
  const bookingIds = useMemo(() => bookings.map((booking) => booking.uuid), [bookings]);
  const selectedIdSet = useMemo(() => new Set(selectedBookingIds), [selectedBookingIds]);
  const { linkedGamesByBookingId, loading: linkedGamesLoading, reload: reloadLinkedGames } =
    useBooktimeLinkedGamesByBookingIds(bookingIds);
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
  const groupSlotSegments = useMemo(
    () => linkedGamesBookingGroupSlotSegments(bookings, linkedGamesByBookingId, clubTimezone),
    [bookings, linkedGamesByBookingId, clubTimezone],
  );
  const anyChildSelected = useMemo(
    () => bookings.some((booking) => selectedIdSet.has(booking.uuid)),
    [bookings, selectedIdSet],
  );
  const hourPickerOptions = useMemo(
    () =>
      bookings.map((booking) => ({
        booking,
        linkedGames: linkedGamesLoading
          ? []
          : (linkedGamesByBookingId.get(booking.uuid) ?? []),
        priceQuote: priceById.get(booking.uuid) ?? null,
      })),
    [bookings, linkedGamesByBookingId, linkedGamesLoading, priceById],
  );

  const showChildren = selectable
    ? true
    : expandableActions
      ? actionsExpanded
      : expanded;
  const showChevron = !selectable && !expandableActions;
  const isHighlighted =
    (selectable && anyChildSelected) || (expandableActions && actionsExpanded);
  const actionRevealClass = (visible: boolean) =>
    `grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
      visible ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
    }`;

  const shellClassName = `rounded-xl border ${
    isHighlighted
      ? 'border-primary-300 dark:border-primary-600 bg-gradient-to-b from-primary-50/80 to-white dark:from-primary-950/40 dark:to-gray-900'
      : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800'
  } ${compact ? 'px-3 py-2.5' : 'px-3 py-3'} ${expandableActions ? 'space-y-0' : ''}`;

  const cornerStack = (
    <div className="pointer-events-none absolute top-0 right-0 flex flex-col items-end gap-0.5">
      <BooktimeBookingPriceLabel
        quote={totalPrice}
        className="text-right text-xs font-semibold tabular-nums text-gray-700 dark:text-gray-200"
      />
      <BooktimeBookingOccupancyPill segments={groupSlotSegments} />
      {showChevron ? (
        <ChevronDown
          size={18}
          strokeWidth={2}
          className={`mt-0.5 text-gray-500 transition-transform duration-300 ease-out motion-reduce:transition-none dark:text-gray-400 ${
            expanded ? 'rotate-180' : ''
          }`}
          aria-hidden
        />
      ) : null}
    </div>
  );

  const headerContent = (
    <div className="min-w-0 flex-1 pr-14">
      {showClubName ? (
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{club.clubName}</p>
      ) : null}
      <CourtDisplayName
        name={courtInfo.courtName}
        integrationName={courtInfo.integrationCourtName}
        primaryClassName="text-sm font-semibold text-gray-900 dark:text-white truncate"
        secondaryClassName="text-[10px] text-gray-500 dark:text-gray-400 truncate"
      />
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        <span>{whenLabel}</span>
      </p>
      {!showChildren ? (
        <div className={`min-h-0 overflow-hidden ${compact ? 'pt-1' : 'pt-1.5'}`}>
          <BooktimeSlotTimeCards bookings={bookings} clubTimezone={clubTimezone} />
        </div>
      ) : null}
    </div>
  );

  const childRows = (
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
          readOnly
          linkedGames={
            linkedGamesLoading
              ? undefined
              : (linkedGamesByBookingId.get(booking.uuid) ?? [])
          }
          onLinkedGamesReload={() => void reloadLinkedGames()}
          priceQuote={priceById.get(booking.uuid) ?? null}
          onRefreshSnapshot={onRefreshSnapshot}
          onCanceled={() => onCanceled?.(booking.uuid)}
        />
      ))}
    </ul>
  );

  const childrenPanel = expandableActions ? (
    <div className={actionRevealClass(showChildren)}>
      <div className="min-h-0 overflow-hidden">{showChildren ? childRows : null}</div>
    </div>
  ) : (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
        showChildren ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className="min-h-0 overflow-hidden">{childRows}</div>
    </div>
  );

  if (selectable && onToggleBooking) {
    const selectableGroup = (
      <div className={`relative w-full text-left ${shellClassName} flex flex-col gap-3`}>
        <div className="relative flex w-full items-start">
          {cornerStack}
          {headerContent}
        </div>
        <BooktimeAdjacentHourPicker
          options={hourPickerOptions}
          selectedBookingIds={selectedBookingIds}
          selectionMax={selectionMax}
          clubTimezone={clubTimezone}
          onToggleBooking={onToggleBooking}
        />
      </div>
    );
    return nested ? (
      selectableGroup
    ) : (
      <BooktimeBookingListItem entryVariants={entryVariants}>{selectableGroup}</BooktimeBookingListItem>
    );
  }

  const handleHeaderClick = expandableActions
    ? onToggleActions
    : () => setExpanded((value) => !value);

  return (
    <BooktimeBookingListItem entryVariants={entryVariants} className={shellClassName}>
      <button
        type="button"
        data-testid={expandableActions ? 'booktime-booking-group-toggle' : undefined}
        aria-expanded={showChildren}
        onClick={handleHeaderClick}
        className="relative w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-md"
      >
        {cornerStack}
        {headerContent}
      </button>
      {childrenPanel}
    </BooktimeBookingListItem>
  );
}
