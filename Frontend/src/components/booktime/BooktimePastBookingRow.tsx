import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { BookingListClubRow } from '@/hooks/connectedBookingClubs';
import { CourtDisplayName } from '@/components/CourtDisplayName';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { useBooktimeLinkedGame } from '@/hooks/useBooktimeLinkedGame';
import {
  linkedGamesBookingSlotSegments,
  linkedGamesFullyCoverBookingSlot,
} from '@/services/gameBooking/linkBookingToGame';
import type { ResolvedDisplaySettings } from '@/utils/displayPreferences';
import { BooktimeBookingOccupancyPill } from './BooktimeBookingOccupancyPill';
import { BooktimeBookingPriceLabel } from './BooktimeBookingPriceLabel';
import { BooktimeLinkedGameLink } from './BooktimeLinkedGameLink';
import { BooktimeLinkGameButton } from './BooktimeLinkGameModal';
import { bookingPriceQuote } from './booktimeBookingPrices';
import { formatBooktimeBookingWhen, resolveBooktimeMyClubTimezone, resolveCourtForBooking } from './booktimeBookingUtils';
import { useBooktimeClubCurrency } from './useBooktimeClubCurrency';

type PastBookingRow = BooktimeBookingRecord & {
  clubId: string;
  clubName: string;
};

type Props = {
  booking: PastBookingRow;
  club: BookingListClubRow;
  displaySettings: ResolvedDisplaySettings;
  showClubName?: boolean;
  providerLabel?: string;
  expandableActions?: boolean;
  actionsExpanded?: boolean;
  onToggleActions?: () => void;
};

export function BooktimePastBookingRow({
  booking,
  club,
  displaySettings,
  showClubName = false,
  providerLabel,
  expandableActions = false,
  actionsExpanded = false,
  onToggleActions,
}: Props) {
  const { t } = useTranslation();
  const { linkedGames, reload: reloadLinkedGame } = useBooktimeLinkedGame(booking.uuid);
  const slotFullyLinked = useMemo(
    () => linkedGamesFullyCoverBookingSlot(booking, linkedGames, resolveBooktimeMyClubTimezone(club)),
    [booking, linkedGames, club],
  );
  const slotSegments = useMemo(
    () => linkedGamesBookingSlotSegments(booking, linkedGames, resolveBooktimeMyClubTimezone(club)),
    [booking, linkedGames, club],
  );
  const courtInfo = resolveCourtForBooking(booking, club, t('club.booktime.unknownCourt'));
  const currency = useBooktimeClubCurrency(club);
  const priceQuote = useMemo(
    () => bookingPriceQuote(booking, currency ?? ''),
    [booking, currency],
  );

  const cornerStack = (
    <div className="pointer-events-none absolute top-2 right-3 flex flex-col items-end gap-1">
      {priceQuote ? (
        <BooktimeBookingPriceLabel
          quote={priceQuote}
          className="text-right text-xs font-medium text-gray-700 dark:text-gray-300"
        />
      ) : null}
      <BooktimeBookingOccupancyPill segments={slotSegments} />
    </div>
  );

  const rowContent = (
    <div className={`min-w-0 ${priceQuote ? 'pr-14' : 'pr-12'}`}>
      {showClubName ? (
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate mb-0.5">
          {booking.clubName}
          {providerLabel ? ` · ${providerLabel}` : ''}
        </p>
      ) : null}
      <CourtDisplayName
        name={courtInfo.courtName}
        integrationName={courtInfo.integrationCourtName}
        primaryClassName="font-medium text-gray-900 dark:text-white"
        secondaryClassName="text-[10px] text-gray-500 dark:text-gray-400"
      />
      <span className="text-xs text-gray-500 mt-0.5 block">
        {formatBooktimeBookingWhen(booking, {
          timezone: resolveBooktimeMyClubTimezone(club),
          displaySettings,
        })}
      </span>
      {linkedGames.map((game) => (
        <BooktimeLinkedGameLink key={game.id} game={game} />
      ))}
    </div>
  );

  const linkGameButton = !slotFullyLinked ? (
    <BooktimeLinkGameButton
      booking={booking}
      club={club}
      onLinked={() => void reloadLinkedGame()}
    />
  ) : null;

  const showActions = !expandableActions || actionsExpanded;

  return (
    <li
      className={`relative rounded-lg border px-3 py-2.5 text-sm text-gray-600 dark:text-gray-300 ${
        expandableActions && actionsExpanded
          ? 'border-primary-400 dark:border-primary-600 bg-primary-50/50 dark:bg-primary-950/30'
          : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800'
      }`}
    >
      {cornerStack}
      {expandableActions && linkGameButton ? (
        <button
          type="button"
          data-testid="booktime-past-booking-card-toggle"
          aria-expanded={actionsExpanded}
          onClick={onToggleActions}
          className="w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-md"
        >
          {rowContent}
        </button>
      ) : (
        rowContent
      )}
      {expandableActions && linkGameButton ? (
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
            showActions ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="pt-2">{linkGameButton}</div>
          </div>
        </div>
      ) : linkGameButton ? (
        <div className="mt-2">{linkGameButton}</div>
      ) : null}
    </li>
  );
}
