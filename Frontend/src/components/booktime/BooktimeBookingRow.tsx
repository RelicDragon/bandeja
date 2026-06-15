import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Check, X } from 'lucide-react';
import { motion } from 'framer-motion';
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
  formatBooktimeBookingWhen,
  resolveCourtForBooking,
} from './booktimeBookingUtils';
import { buildCreateGameDeepLinkParams } from '@/services/gameBooking/linkBookingToGame';
import { BooktimeLinkedGameLink } from './BooktimeLinkedGameLink';
import { BooktimeLinkGameButton } from './BooktimeLinkGameModal';
import { BooktimeBookingPriceLabel } from './BooktimeBookingPriceLabel';
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
  onToggleSelect?: () => void;
  readOnly?: boolean;
  trailing?: ReactNode;
  courtOverride?: {
    courtName: string;
    integrationCourtName?: string | null;
  };
  nested?: boolean;
  priceQuote?: ReturnType<typeof bookingPriceQuote>;
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
  onToggleSelect,
  readOnly = false,
  trailing,
  courtOverride,
  nested = false,
  priceQuote: priceQuoteProp,
}: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);
  const navigate = useNavigate();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const { linkedGame, linkedGames: fetchedLinkedGames, reload: reloadLinkedGame } = useBooktimeLinkedGame(
    booking.uuid,
    !selectable && !readOnly,
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

  const rowContent = (
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
        {formatBooktimeBookingWhen(booking, { timezone: clubTimezone, displaySettings })}
      </p>
      <BooktimeBookingPriceLabel quote={priceQuote} />
      {selectable ? <LinkedGamesPills games={linkedGames} /> : null}
      {!selectable
        ? linkedGames.map((game) => <BooktimeLinkedGameLink key={game.id} game={game} />)
        : null}
    </div>
  );

  const rowShellClassName = `rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 ${
    compact ? 'px-3 py-2' : 'px-3 py-2.5'
  }`;

  if (readOnly) {
    const shell = (
      <div
        data-testid="linked-booking-card"
        className={`${rowShellClassName} ${trailing ? 'flex items-center justify-between gap-2' : ''}`}
      >
        {rowContent}
        {trailing}
      </div>
    );
    return nested ? shell : <li>{shell}</li>;
  }

  if (selectable) {
    return (
      <li>
        <motion.button
          type="button"
          whileTap={dimmed || (selected && disableDeselect) ? undefined : { scale: 0.98 }}
          disabled={dimmed || (selected && disableDeselect)}
          onClick={onToggleSelect}
          className={`w-full rounded-lg border px-3 py-2.5 flex items-center gap-3 text-left transition-opacity ${
            selected
              ? 'border-primary-400 dark:border-primary-600 bg-primary-50/50 dark:bg-primary-950/30'
              : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800'
          } ${dimmed ? 'opacity-50 cursor-default' : ''} ${selected && disableDeselect ? 'cursor-default' : ''}`}
        >
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
      </li>
    );
  }

  const bookingCard = (
    <div className={`${rowShellClassName} space-y-2`}>
        {cancelDoneBanner ? (
          <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 space-y-2">
            <p className="text-xs text-amber-900 dark:text-amber-100">
              {t('club.booktime.cancelLinkedGameBanner')}
            </p>
            <button
              type="button"
              onClick={() => navigate(`/games/${cancelDoneBanner.id}`)}
              className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
            >
              {t('club.booktime.openLinkedGame')}
            </button>
          </div>
        ) : null}
        {rowContent}
        {!cancelDoneBanner ? (
          <div className="flex flex-wrap gap-2">
            <BooktimeLinkGameButton
              booking={booking}
              club={club}
              compact={compact}
              onLinked={() => void reloadLinkedGame()}
            />
            <button
              type="button"
              onClick={openCreateGame}
              className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
            >
              {t('club.booktime.createGameHere')}
            </button>
            {cancellable ? (
              <button
                type="button"
                onClick={() => setCancelOpen(true)}
                className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline inline-flex items-center gap-1"
              >
                <X size={12} />
                {t('club.booktime.cancelBooking')}
              </button>
            ) : (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {t('club.booktime.cancelTooLate', { hours: allowedHoursToCancel })}
              </span>
            )}
          </div>
        ) : null}
    </div>
  );

  return (
    <>
      {nested ? bookingCard : <li>{bookingCard}</li>}

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
