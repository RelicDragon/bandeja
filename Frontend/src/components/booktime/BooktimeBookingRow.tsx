import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Check, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { motion, type Variants } from 'framer-motion';
import type { BooktimeMyClubRow } from '@/api/booktime';
import type { BooktimeLinkedGame } from '@/api/booktime';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import {
  canCancelByPolicy,
} from '@/integrations/booktime/bookFlow';
import { createHydratedBooktimeClubBookingProvider } from '@/integrations/booking/createBooktimeClubBookingProvider';
import { useBooktimeLinkedGame } from '@/hooks/useBooktimeLinkedGame';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { CourtDisplayName } from '@/components/CourtDisplayName';
import {
  booktimeRowToClub,
  formatBooktimeBookingSlotRange,
  formatBooktimeBookingWhen,
  resolveCourtForBooking,
} from './booktimeBookingUtils';
import {
  buildCreateGameDeepLinkParams,
  linkedGamesBookingSlotSegments,
  linkedGamesFullyCoverBookingSlot,
} from '@/services/gameBooking/linkBookingToGame';
import { BooktimeBookingActionButton } from './BooktimeBookingActionButton';
import { BooktimeBookingOccupancyPill } from './BooktimeBookingOccupancyPill';
import { BooktimeLinkedGameLink } from './BooktimeLinkedGameLink';
import { BooktimeLinkGameButton } from './BooktimeLinkGameModal';
import { BooktimeBookingPriceLabel } from './BooktimeBookingPriceLabel';
import { BooktimeBookingListItem } from './BooktimeBookingListItem';
import { bookingPriceQuote } from './booktimeBookingPrices';
import { useBooktimeClubCurrency } from './useBooktimeClubCurrency';

type Props = {
  booking: BooktimeBookingRecord;
  club: BooktimeMyClubRow;
  showClubName?: boolean;
  allowedHoursToCancel?: number;
  onCanceled?: () => void;
  onCreateGame?: () => void;
  onRefreshSnapshot?: (options?: { force?: boolean }) => Promise<boolean>;
  compact?: boolean;
  clubTimezone?: string | null;
  selectable?: boolean;
  selected?: boolean;
  dimmed?: boolean;
  disableDeselect?: boolean;
  linkedGames?: BooktimeLinkedGame[];
  onLinkedGamesReload?: () => void;
  onToggleSelect?: () => void;
  readOnly?: boolean;
  trailing?: ReactNode;
  courtOverride?: {
    courtName: string;
    integrationCourtName?: string | null;
  };
  nested?: boolean;
  priceQuote?: ReturnType<typeof bookingPriceQuote>;
  expandableActions?: boolean;
  actionsExpanded?: boolean;
  onToggleActions?: () => void;
  entryVariants?: Variants;
};

function LinkedGamesPills({ games }: { games: BooktimeLinkedGame[] }) {
  const { t } = useTranslation();
  if (games.length === 0) return null;
  const labels = games.map((g) => g.name?.trim() || g.id).join(', ');
  return (
    <p className="text-[10px] text-primary-700 dark:text-primary-300 mt-1">
      {t('createGame.locationTime.alsoUsedIn', { games: labels })}
    </p>
  );
}

export function BooktimeBookingRow({
  booking,
  club,
  showClubName = false,
  allowedHoursToCancel = 12,
  onCanceled,
  onCreateGame,
  onRefreshSnapshot,
  compact = false,
  clubTimezone,
  selectable = false,
  selected = false,
  dimmed = false,
  disableDeselect = false,
  linkedGames: linkedGamesProp,
  onLinkedGamesReload,
  onToggleSelect,
  readOnly = false,
  trailing,
  courtOverride,
  nested = false,
  priceQuote: priceQuoteProp,
  expandableActions = false,
  actionsExpanded = false,
  onToggleActions,
  entryVariants,
}: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);
  const navigate = useNavigate();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const { linkedGame, linkedGames: fetchedLinkedGames, reload: reloadLinkedGame } = useBooktimeLinkedGame(
    booking.uuid,
    !selectable && !readOnly && linkedGamesProp === undefined,
  );
  const linkedGames = linkedGamesProp ?? fetchedLinkedGames;
  const [cancelDoneBanner, setCancelDoneBanner] = useState<BooktimeLinkedGame | null>(null);
  const courtInfo = courtOverride
    ? {
        courtName: courtOverride.courtName,
        integrationCourtName: courtOverride.integrationCourtName ?? null,
      }
    : resolveCourtForBooking(booking, club, t('club.booktime.unknownCourt'));
  const cancellable = canCancelByPolicy(booking.bookingStart, allowedHoursToCancel, clubTimezone);
  const currency = useBooktimeClubCurrency(club);
  const priceQuote =
    priceQuoteProp !== undefined ? priceQuoteProp : bookingPriceQuote(booking, currency ?? '');
  const slotFullyLinked = useMemo(
    () => linkedGamesFullyCoverBookingSlot(booking, linkedGames, clubTimezone),
    [booking, linkedGames, clubTimezone],
  );
  const slotSegments = useMemo(
    () => linkedGamesBookingSlotSegments(booking, linkedGames, clubTimezone),
    [booking, linkedGames, clubTimezone],
  );

  const handleLinkedGame = () => {
    if (linkedGamesProp === undefined) {
      void reloadLinkedGame();
    } else {
      onLinkedGamesReload?.();
    }
  };

  const openCreateGame = () => {
    onCreateGame?.();
    const params = buildCreateGameDeepLinkParams(club.clubId, booking, courtInfo.courtId, clubTimezone);
    navigate(`/create-game?${new URLSearchParams(params).toString()}`, { state: { entityType: 'GAME' } });
  };

  const handleConfirmCancel = async () => {
    if (!club.companyId) return;
    setCancelBusy(true);
    try {
      const provider = await createHydratedBooktimeClubBookingProvider(
        booktimeRowToClub(club),
        club.companyId,
      );
      await provider.cancelBooking(
        booking.uuid,
        onRefreshSnapshot ?? (async () => true),
      );
      setCancelOpen(false);
      toast.success(t('club.booktime.cancelSuccess'));
      if (linkedGame) {
        setCancelDoneBanner(linkedGame);
      }
      onCanceled?.();
    } catch (err) {
      console.error('Club booking cancel failed:', err);
      toast.error(t('club.booktime.cancelFailed'));
    } finally {
      setCancelBusy(false);
    }
  };

  const whenLabel = nested
    ? formatBooktimeBookingSlotRange(booking, { timezone: clubTimezone, displaySettings })
    : formatBooktimeBookingWhen(booking, { timezone: clubTimezone, displaySettings });

  const showActionButtons = !expandableActions || actionsExpanded;
  const hasCancel = !readOnly && !selectable && !cancelDoneBanner;
  const showCancelHint = hasCancel && !cancellable;
  const actionRevealClass = (visible: boolean) =>
    `grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
      visible ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
    }`;

  const cancelButton = hasCancel && cancellable ? (
    <BooktimeBookingActionButton
      variant="danger"
      onClick={() => setCancelOpen(true)}
    >
      <Trash2 size={12} aria-hidden />
      {t('club.booktime.cancelBooking')}
    </BooktimeBookingActionButton>
  ) : null;

  const cancelHint = showCancelHint ? (
    <p className="text-[10px] leading-tight text-gray-400 dark:text-gray-500">
      {t('club.booktime.cancelTooLate', { hours: allowedHoursToCancel })}
    </p>
  ) : null;

  const rowContent = (
    <div className={`min-w-0 flex-1 ${priceQuote ? 'pr-14' : 'pr-12'}`}>
      {showClubName && !nested ? (
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{club.clubName}</p>
      ) : null}
      {!nested ? (
        <CourtDisplayName
          name={courtInfo.courtName}
          integrationName={courtInfo.integrationCourtName}
          primaryClassName="text-sm font-medium text-gray-900 dark:text-white truncate"
          secondaryClassName="text-[10px] text-gray-500 dark:text-gray-400 truncate"
        />
      ) : null}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        <span>{whenLabel}</span>
      </p>
      {selectable ? <LinkedGamesPills games={linkedGames} /> : null}
      {!selectable
        ? linkedGames.map((game) => <BooktimeLinkedGameLink key={game.id} game={game} />)
        : null}
    </div>
  );

  const rowShellClassName = `rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 ${
    compact ? 'px-3 py-2' : 'px-3 py-2.5'
  }`;

  const cornerStack = (
    <div className="absolute top-2 right-3 z-10 flex flex-col items-end gap-1 pointer-events-none">
      {priceQuote ? (
        <BooktimeBookingPriceLabel
          quote={priceQuote}
          className="text-right text-xs font-medium text-gray-700 dark:text-gray-300"
        />
      ) : null}
      <BooktimeBookingOccupancyPill segments={slotSegments} />
    </div>
  );

  if (readOnly) {
    const shell = (
      <div
        data-testid="linked-booking-card"
        className={`${rowShellClassName} relative ${trailing ? 'flex items-center justify-between gap-2' : ''}`}
      >
        {cornerStack}
        {rowContent}
        {trailing}
      </div>
    );
    return nested ? shell : (
      <BooktimeBookingListItem entryVariants={entryVariants}>{shell}</BooktimeBookingListItem>
    );
  }

  if (selectable) {
    return (
      <BooktimeBookingListItem entryVariants={entryVariants}>
        <motion.button
          type="button"
          whileTap={dimmed || (selected && disableDeselect) ? undefined : { scale: 0.98 }}
          disabled={dimmed || (selected && disableDeselect)}
          onClick={onToggleSelect}
          className={`relative w-full rounded-lg border px-3 py-2.5 flex items-center gap-3 text-left transition-opacity ${
            selected
              ? 'border-primary-400 dark:border-primary-600 bg-primary-50/50 dark:bg-primary-950/30'
              : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800'
          } ${dimmed ? 'opacity-50 cursor-default' : ''} ${selected && disableDeselect ? 'cursor-default' : ''}`}
        >
          {cornerStack}
          <span
            className={`h-5 w-5 rounded-full border flex items-center justify-center shrink-0 ${
              selected
                ? 'border-primary-500 bg-primary-500 text-white'
                : 'border-gray-300 dark:border-gray-600'
            }`}
          >
            {selected ? (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 28 }}>
                <Check size={12} />
              </motion.span>
            ) : null}
          </span>
          {rowContent}
        </motion.button>
      </BooktimeBookingListItem>
    );
  }

  const cancelDoneBannerBlock = cancelDoneBanner ? (
    <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 space-y-2">
      <p className="text-xs text-amber-900 dark:text-amber-100">
        {t('club.booktime.cancelLinkedGameBanner')}
      </p>
      <BooktimeBookingActionButton onClick={() => navigate(`/games/${cancelDoneBanner.id}`)}>
        <ExternalLink size={12} aria-hidden />
        {t('club.booktime.openLinkedGame')}
      </BooktimeBookingActionButton>
    </div>
  ) : null;

  const actionButtons = !cancelDoneBanner && (!slotFullyLinked || hasCancel) ? (
    <div className="flex flex-wrap items-center gap-2">
      {!slotFullyLinked ? (
        <>
          <BooktimeLinkGameButton
            booking={booking}
            club={club}
            hasLinkedGame={linkedGames.length > 0}
            onLinked={handleLinkedGame}
          />
          <BooktimeBookingActionButton onClick={openCreateGame}>
            <Plus size={12} aria-hidden />
            {t('club.booktime.createGameHere')}
          </BooktimeBookingActionButton>
        </>
      ) : null}
      {hasCancel && cancellable ? cancelButton : null}
    </div>
  ) : null;

  const bookingCard = (
    <div
      className={`${rowShellClassName} relative ${
        expandableActions && actionsExpanded
          ? 'border-primary-400 dark:border-primary-600 bg-primary-50/50 dark:bg-primary-950/30'
          : ''
      } ${expandableActions ? 'space-y-0' : 'space-y-2'}`}
    >
      {cornerStack}
      {cancelDoneBannerBlock}
      {expandableActions ? (
        <button
          type="button"
          data-testid="booktime-booking-card-toggle"
          aria-expanded={actionsExpanded}
          onClick={onToggleActions}
          className="w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-md"
        >
          {rowContent}
        </button>
      ) : (
        rowContent
      )}
      {expandableActions ? (
        <div className={actionRevealClass(Boolean(showActionButtons && (actionButtons || cancelHint)))}>
          <div className="min-h-0 overflow-hidden">
            {actionButtons ? <div className="pt-2">{actionButtons}</div> : null}
            {cancelHint ? (
              <div className={actionButtons ? 'pt-1' : 'pt-2'}>{cancelHint}</div>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          {actionButtons}
          {cancelHint ? (
            <div className={actionButtons ? 'pt-1' : undefined}>{cancelHint}</div>
          ) : null}
        </>
      )}
    </div>
  );

  return (
    <>
      {nested ? (
        bookingCard
      ) : (
        <BooktimeBookingListItem entryVariants={entryVariants}>{bookingCard}</BooktimeBookingListItem>
      )}

      <ConfirmationModal
        isOpen={cancelOpen}
        onClose={() => !cancelBusy && setCancelOpen(false)}
        title={t('club.booktime.cancelConfirmTitle')}
        message={
          linkedGames.length > 0
            ? t('club.booktime.cancelConfirmLinkedBody', { hours: allowedHoursToCancel })
            : t('club.booktime.cancelConfirmBody', { hours: allowedHoursToCancel })
        }
        confirmText={t('club.booktime.cancelConfirmCta')}
        confirmVariant="danger"
        isLoading={cancelBusy}
        onConfirm={() => void handleConfirmCancel()}
      />
    </>
  );
}
