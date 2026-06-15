import { Link2, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { BooktimeMyClubRow } from '@/api/booktime';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { Button } from '@/components';
import { BooktimeBookingActionButton } from './BooktimeBookingActionButton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { useAuthStore } from '@/store/authStore';
import type { Game } from '@/types';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { formatGameTimeInTimezone, getClubTimezone, getUserTimezone } from '@/utils/gameTimeDisplay';
import { formatBooktimeBookingWhen, resolveCourtForBooking } from './booktimeBookingUtils';
import {
  gameNeedsDatetimeUpdateForLink,
  isRecommendedLinkTarget,
  linkBookingToGame,
  resolveBooktimeClubTimezone,
} from '@/services/gameBooking/linkBookingToGame';
import { useBooktimeLinkableGames } from './useBooktimeLinkableGames';

type ModalProps = {
  booking: BooktimeBookingRecord;
  club: BooktimeMyClubRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: () => void;
};

export function BooktimeLinkGameModal({ booking, club, open, onOpenChange, onLinked }: ModalProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);
  const { games, loading, error } = useBooktimeLinkableGames(booking, open);
  const [pendingGame, setPendingGame] = useState<Game | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const courtInfo = resolveCourtForBooking(booking, club, t('club.booktime.unknownCourt'));
  const clubTimezone = resolveBooktimeClubTimezone({ club });
  const bookingWhen = formatBooktimeBookingWhen(booking, {
    timezone: clubTimezone,
    displaySettings,
  });

  const formatGameWhen = (game: Game) => {
    if (game.timeIsSet !== true) {
      return t('gameDetails.datetimeNotSet');
    }
    const tz = getClubTimezone(game) ?? getUserTimezone();
    const start = formatGameTimeInTimezone(game.startTime, tz, displaySettings);
    const end = formatGameTimeInTimezone(game.endTime, tz, displaySettings);
    return `${start} – ${end}`;
  };

  const performLink = async (game: Game) => {
    setLinkBusy(true);
    try {
      await linkBookingToGame({
        gameId: game.id,
        game,
        booking,
        club,
        options: { courtId: courtInfo.courtId, timeZone: clubTimezone },
      });
      toast.success(t('club.booktime.linkGameSuccess'));
      onOpenChange(false);
      onLinked();
    } catch (err) {
      console.error('Link booking to game failed:', err);
      toast.error(t('club.booktime.linkGameFailed'));
    } finally {
      setLinkBusy(false);
      setPendingGame(null);
    }
  };

  const handleSelectGame = (game: Game) => {
    if (linkBusy) return;
    if (gameNeedsDatetimeUpdateForLink(game, booking, clubTimezone) && game.timeIsSet === true) {
      setPendingGame(game);
      return;
    }
    void performLink(game);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange} modalId="booktime-link-game">
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('club.booktime.linkGameTitle')}</DialogTitle>
            <DialogDescription>{t('club.booktime.linkGameHint', { when: bookingWhen })}</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-1 -mx-1">
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="animate-spin text-primary-600" size={28} />
              </div>
            ) : error ? (
              <p className="py-6 text-center text-sm text-red-600 dark:text-red-400">
                {t('club.booktime.linkGameLoadFailed')}
              </p>
            ) : games.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                {t('club.booktime.linkGameEmpty')}
              </p>
            ) : (
              <ul className="space-y-2 py-1">
                {games.map((game) => {
                  const recommended = isRecommendedLinkTarget(game, booking, clubTimezone);
                  return (
                    <li key={game.id}>
                      <button
                        type="button"
                        disabled={linkBusy}
                        onClick={() => handleSelectGame(game)}
                        className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${
                          recommended
                            ? 'border-primary-300 bg-primary-50/80 hover:bg-primary-100/80 dark:border-primary-700 dark:bg-primary-950/30 dark:hover:bg-primary-950/50'
                            : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700/50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-gray-900 dark:text-white truncate">
                              {game.name?.trim() || t('club.booktime.linkedGameUntitled')}
                            </span>
                            <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              {formatGameWhen(game)}
                            </span>
                            {game.club?.name ? (
                              <span className="block text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                                {game.club.name}
                              </span>
                            ) : null}
                          </span>
                          {recommended ? (
                            <span className="shrink-0 rounded-full bg-primary-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                              {t('club.booktime.linkGameRecommended')}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={linkBusy}>
              {t('common.cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationModal
        isOpen={!!pendingGame}
        onClose={() => !linkBusy && setPendingGame(null)}
        title={t('club.booktime.linkGameRescheduleTitle')}
        message={t('club.booktime.linkGameRescheduleBody', { when: bookingWhen })}
        confirmText={t('club.booktime.linkGameRescheduleConfirm')}
        confirmVariant="primary"
        isLoading={linkBusy}
        closeOnConfirm={false}
        onConfirm={() => {
          if (pendingGame) void performLink(pendingGame);
        }}
      />
    </>
  );
}

type ButtonProps = {
  booking: BooktimeBookingRecord;
  club: BooktimeMyClubRow;
  onLinked: () => void;
  hasLinkedGame?: boolean;
};

export function BooktimeLinkGameButton({
  booking,
  club,
  onLinked,
  hasLinkedGame = false,
}: ButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const label = hasLinkedGame
    ? t('club.booktime.linkGameMoreShort')
    : t('club.booktime.linkGameShort');

  return (
    <>
      <BooktimeBookingActionButton onClick={() => setOpen(true)}>
        <Link2 size={12} aria-hidden />
        {label}
      </BooktimeBookingActionButton>
      <BooktimeLinkGameModal
        booking={booking}
        club={club}
        open={open}
        onOpenChange={setOpen}
        onLinked={onLinked}
      />
    </>
  );
}
