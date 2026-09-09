import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, Check, ExternalLink, Link2, Plus, Trash2 } from 'lucide-react';
import { motion, type Variants } from 'framer-motion';
import type { BooktimeLinkedGame } from '@/api/booktime';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import {
  canCancelByPolicy,
} from '@/integrations/booktime/bookFlow';
import { createHydratedClubBookingProvider } from '@/integrations/booking/createClubBookingProvider';
import {
  bookingListClubRowToClub,
  type BookingListClubRow,
} from '@/hooks/connectedBookingClubs';
import { useBooktimeLinkedGame } from '@/hooks/useBooktimeLinkedGame';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { CourtDisplayName } from '@/components/CourtDisplayName';
import {
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
import { VerifyBookingButton } from './VerifyBookingButton';
import { BooktimeBookingOccupancyPill } from './BooktimeBookingOccupancyPill';
import { BooktimeLinkedGameLink } from './BooktimeLinkedGameLink';
import { BooktimeLinkGameButton } from './BooktimeLinkGameModal';
import { BooktimeBookingPriceLabel } from './BooktimeBookingPriceLabel';
import { BooktimeBookingListItem } from './BooktimeBookingListItem';
import { bookingPriceQuote } from './booktimeBookingPrices';
import { useBooktimeClubCurrency } from './useBooktimeClubCurrency';

type Props = {
  onLinkToCurrentGame?: (booking: BooktimeBookingRecord) => void;
  booking: BooktimeBookingRecord;
  club: BookingListClubRow;
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
    <span className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-md border border-amber-200/80 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium leading-snug text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
      <AlertTriangle size={10} className="shrink-0" aria-hidden />
      <span className="truncate">{t('createGame.locationTime.alsoUsedIn', { games: labels })}</span>
    </span>
  );
}

export function BooktimeBookingRow({
  booking,
  club,
  showClubName = false,
  allowedHoursToCancel = 12,
  onCanceled,
  onCreateGame,
  onLinkToCurrentGame,
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
  const [cancelStep, setCancelStep] = useState<'policyWarning' | 'confirm' | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const { linkedGame, linkedGames: fetchedLinkedGames, reload: reloadLinkedGame } = useBooktimeLinkedGame(
    booking.uuid,
    !selectable && linkedGamesProp === undefined,
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
    if (cancelBusy) return;
    setCancelBusy(true);
    try {
      const clubEntity = bookingListClubRowToClub(club);
      const provider = await createHydratedClubBookingProvider(clubEntity);
      if (!provider) throw new Error('Booking cancellation unavailable');
      await provider.cancelBooking(
        booking.uuid,
        onRefreshSnapshot ?? (async () => true),
      );
      setCancelStep(null);
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

  const cancelButton = hasCancel ? (
    <BooktimeBookingActionButton
      variant="danger"
      disabled={cancelBusy}
      onClick={() => setCancelStep(
        canCancelByPolicy(booking.bookingStart, allowedHoursToCancel, clubTimezone)
          ? 'confirm'
          : 'policyWarning',
      )}
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
    <div className={`min-w-0 flex-1 ${priceQuote ? 'pe-14' : 'pe-12'}`}>
      {showClubName && !nested ? (
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">
          {club.clubName}
          {club.integrationType === 'PADELOO'
            ? ` · ${t('club.padeloo.providerLabel', { defaultValue: 'Padeloo' })}`
            : club.integrationType === 'KLIKTEREN'
              ? ` · ${t('club.klikteren.providerLabel', { defaultValue: 'Klikteren' })}`
              : ''}
        </p>
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
          className="text-end text-xs font-medium text-gray-700 dark:text-gray-300"
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
    const selectableRow = (
      <motion.button
        type="button"
        whileTap={dimmed || (selected && disableDeselect) ? undefined : { scale: 0.98 }}
        disabled={dimmed || (selected && disableDeselect)}
        onClick={onToggleSelect}
        className={`relative w-full rounded-lg border px-3 py-2.5 flex items-center gap-3 text-start transition-opacity ${
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
    );
    return nested ? (
      selectableRow
    ) : (
      <BooktimeBookingListItem entryVariants={entryVariants}>{selectableRow}</BooktimeBookingListItem>
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
          {onLinkToCurrentGame ? (
            <BooktimeBookingActionButton onClick={() => onLinkToCurrentGame(booking)}>
              <Link2 size={12} aria-hidden />
              {t('club.booktime.linkToThisGame')}
            </BooktimeBookingActionButton>
          ) : <BooktimeLinkGameButton
            booking={booking}
            club={club}
            hasLinkedGame={linkedGames.length > 0}
            onLinked={handleLinkedGame}
          />}
          {!onLinkToCurrentGame && <BooktimeBookingActionButton onClick={openCreateGame}>
            <Plus size={12} aria-hidden />
            {t('club.booktime.createGameHere')}
          </BooktimeBookingActionButton>}
        </>
      ) : null}
      {cancelButton}
      <VerifyBookingButton bookingId={booking.uuid} club={club} disabled={cancelBusy} onRemoved={onCanceled} />
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
          className="w-full text-start outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-md"
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
        isOpen={cancelStep !== null}
        onClose={() => !cancelBusy && setCancelStep(null)}
        title={t(cancelStep === 'policyWarning'
          ? 'club.booktime.cancelOutsidePolicyTitle'
          : 'club.booktime.cancelConfirmTitle')}
        message={
          cancelStep === 'policyWarning'
            ? t('club.booktime.cancelOutsidePolicyBody', { hours: allowedHoursToCancel, count: allowedHoursToCancel })
            : linkedGames.length > 0
              ? t('club.booktime.cancelConfirmLinkedBody', { hours: allowedHoursToCancel, count: allowedHoursToCancel })
              : t('club.booktime.cancelConfirmBody', { hours: allowedHoursToCancel, count: allowedHoursToCancel })
        }
        confirmText={t(cancelStep === 'policyWarning' ? 'common.continue' : 'club.booktime.cancelConfirmCta')}
        confirmVariant="danger"
        isLoading={cancelBusy}
        loadingText={t('club.booktime.cancelingBooking')}
        closeOnConfirm={false}
        onConfirm={() => {
          if (cancelStep === 'policyWarning') {
            setCancelStep('confirm');
          } else {
            void handleConfirmCancel();
          }
        }}
      />
    </>
  );
}
