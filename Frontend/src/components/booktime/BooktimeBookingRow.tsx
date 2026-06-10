import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import type { BooktimeMyClubRow } from '@/api/booktime';
import type { BooktimeLinkedGame } from '@/api/booktime';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { booktimeApi } from '@/api/booktime';
import {
  canCancelByPolicy,
  cancelBooktimeBooking,
} from '@/integrations/booktime/bookFlow';
import { getBooktimeClient, hydrateBooktimeSession } from '@/integrations/booktime/session';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import {
  buildCreateGameSearchParams,
  formatBooktimeBookingWhen,
  resolveCourtForBooking,
} from './booktimeBookingUtils';

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
};

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
}: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);
  const navigate = useNavigate();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [linkedGame, setLinkedGame] = useState<BooktimeLinkedGame | null>(null);
  const [cancelDoneBanner, setCancelDoneBanner] = useState<BooktimeLinkedGame | null>(null);
  const courtInfo = resolveCourtForBooking(booking, club, t('club.booktime.unknownCourt'));
  const cancellable = canCancelByPolicy(booking.bookingStart, allowedHoursToCancel);

  useEffect(() => {
    if (!cancelOpen) return;
    void (async () => {
      try {
        const res = await booktimeApi.getLinkedGame(booking.uuid);
        setLinkedGame(res.data ?? null);
      } catch {
        setLinkedGame(null);
      }
    })();
  }, [cancelOpen, booking.uuid]);

  const openCreateGame = () => {
    onCreateGame?.();
    const params = buildCreateGameSearchParams(club.clubId, booking, courtInfo.courtId);
    navigate(`/create-game?${params.toString()}`, { state: { entityType: 'GAME' } });
  };

  const handleConfirmCancel = async () => {
    if (!club.companyId) return;
    setCancelBusy(true);
    try {
      await hydrateBooktimeSession(club.clubId, club.companyId);
      const client = getBooktimeClient(club.clubId, club.companyId);
      await cancelBooktimeBooking(
        client,
        booking.uuid,
        onRefreshSnapshot ?? (async () => true)
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

  return (
    <>
      <li
        className={`rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 ${
          compact ? 'px-3 py-2' : 'px-3 py-2.5'
        } space-y-2`}
      >
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
        <div className="min-w-0">
          {showClubName ? (
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{club.clubName}</p>
          ) : null}
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{courtInfo.courtName}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {formatBooktimeBookingWhen(booking, { timezone: clubTimezone, displaySettings, t })}
          </p>
        </div>
        {!cancelDoneBanner ? (
          <div className="flex flex-wrap gap-2">
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
      </li>

      <ConfirmationModal
        isOpen={cancelOpen}
        onClose={() => !cancelBusy && setCancelOpen(false)}
        title={t('club.booktime.cancelConfirmTitle')}
        message={
          linkedGame
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
