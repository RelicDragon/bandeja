import { Check, ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, type Variants } from 'framer-motion';
import type { BooktimeLinkedGame, BooktimeMyClubRow } from '@/api/booktime';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { useBooktimeLinkedGamesByBookingIds } from '@/hooks/useBooktimeLinkedGamesByBookingIds';
import { linkedGamesBookingGroupSlotSegments } from '@/services/gameBooking/linkBookingToGame';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { CourtDisplayName } from '@/components/CourtDisplayName';
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
  club: BooktimeMyClubRow;
  showClubName?: boolean;
  allowedHoursToCancel?: number;
  compact?: boolean;
  clubTimezone?: string | null;
  onCanceled?: (bookingId: string) => void;
  onRefreshSnapshot?: (options?: { force?: boolean }) => Promise<boolean>;
  selectable?: boolean;
  selected?: boolean;
  dimmed?: boolean;
  disableDeselect?: boolean;
  onToggleSelect?: () => void;
  expandableActions?: boolean;
  actionsExpanded?: boolean;
  onToggleActions?: () => void;
  entryVariants?: Variants;
};

function GroupLinkedGamesPills({ games }: { games: BooktimeLinkedGame[] }) {
  const { t } = useTranslation();
  if (games.length === 0) return null;
  const labels = games.map((g) => g.name?.trim() || g.id).join(', ');
  return (
    <p className="text-[10px] text-primary-700 dark:text-primary-300 mt-1">
      {t('createGame.locationTime.alsoUsedIn', { games: labels })}
    </p>
  );
}

function uniqueLinkedGames(
  linkedGamesByBookingId: Map<string, BooktimeLinkedGame[]>,
  bookingIds: string[],
): BooktimeLinkedGame[] {
  const seen = new Set<string>();
  const result: BooktimeLinkedGame[] = [];
  for (const bookingId of bookingIds) {
    for (const game of linkedGamesByBookingId.get(bookingId) ?? []) {
      if (seen.has(game.id)) continue;
      seen.add(game.id);
      result.push(game);
    }
  }
  return result;
}

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
  selected = false,
  dimmed = false,
  disableDeselect = false,
  onToggleSelect,
  expandableActions = false,
  actionsExpanded = false,
  onToggleActions,
  entryVariants,
}: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);
  const [expanded, setExpanded] = useState(false);
  const bookingIds = useMemo(() => bookings.map((booking) => booking.uuid), [bookings]);
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
  const groupLinkedGames = useMemo(
    () => uniqueLinkedGames(linkedGamesByBookingId, bookingIds),
    [linkedGamesByBookingId, bookingIds],
  );

  const showChildren = selectable ? selected : expandableActions ? actionsExpanded : expanded;
  const showChevron = !selectable && !expandableActions;
  const isHighlighted =
    (selectable && selected) || (expandableActions && actionsExpanded);
  const actionRevealClass = (visible: boolean) =>
    `grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
      visible ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
    }`;

  const shellClassName = `rounded-lg border ${
    isHighlighted
      ? 'border-primary-400 dark:border-primary-600 bg-primary-50/50 dark:bg-primary-950/30'
      : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800'
  } ${compact ? 'px-3 py-2' : 'px-3 py-2.5'} ${expandableActions ? 'space-y-0' : ''}`;

  const cornerStack = (
    <div className="pointer-events-none absolute top-0 right-0 flex flex-col items-end">
      <BooktimeBookingPriceLabel
        quote={totalPrice}
        className="text-right text-xs font-medium text-gray-700 dark:text-gray-300"
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
        primaryClassName="text-sm font-medium text-gray-900 dark:text-white truncate"
        secondaryClassName="text-[10px] text-gray-500 dark:text-gray-400 truncate"
      />
      <p className="text-xs text-gray-500 dark:text-gray-400">
        <span>{whenLabel}</span>
      </p>
      {selectable ? <GroupLinkedGamesPills games={groupLinkedGames} /> : null}
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
          readOnly={selectable}
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
  ) : selectable ? (
    showChildren ? childRows : null
  ) : (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
        showChildren ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className="min-h-0 overflow-hidden">{childRows}</div>
    </div>
  );

  if (selectable) {
    return (
      <BooktimeBookingListItem entryVariants={entryVariants}>
        <motion.button
          type="button"
          whileTap={dimmed || (selected && disableDeselect) ? undefined : { scale: 0.98 }}
          disabled={dimmed || (selected && disableDeselect)}
          onClick={onToggleSelect}
          className={`relative w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${shellClassName} flex flex-col transition-opacity ${
            dimmed ? 'opacity-50 cursor-default' : ''
          } ${selected && disableDeselect ? 'cursor-default' : ''}`}
        >
          <div className="relative flex w-full items-start gap-3">
            {cornerStack}
            <span
              className={`mt-0.5 h-5 w-5 rounded-full border flex items-center justify-center shrink-0 ${
                selected
                  ? 'border-primary-500 bg-primary-500 text-white'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
            >
              {selected ? (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                >
                  <Check size={12} />
                </motion.span>
              ) : null}
            </span>
            {headerContent}
          </div>
          {childrenPanel}
        </motion.button>
      </BooktimeBookingListItem>
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
