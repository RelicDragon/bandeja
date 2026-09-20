import { useRef, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { weltnerApi, type WeltnerReceipt } from '@/api/weltner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { formatClubDateKey } from '@/integrations/booktime/slots';
import type { NspadelCreateGameConfirmModal } from './NspadelCreateGameConfirmModal';

type Props = ComponentProps<typeof NspadelCreateGameConfirmModal>;
export function WeltnerCreateGameConfirmModal({
  open,
  onOpenChange,
  club,
  bookings,
  onExecuteCreateGame,
  onSuccess,
  flowMode = 'create',
}: Props) {
  const { t } = useTranslation();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [unknown, setUnknown] = useState(false);
  async function confirm() {
    if (inFlight.current || unknown || !bookings.length) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const receipts: WeltnerReceipt[] = [];
    try {
      for (const entry of bookings) {
        // The server reuses its durable receipt on a retry, even after remount/reload.
        receipts.push(
          await weltnerApi.book(club.id, {
            courtId: entry.court.id,
            date: formatClubDateKey(entry.date, club),
            startTime: entry.startTime,
            durationMinutes: entry.durationMinutes,
          }),
        );
        setConfirmedCount(receipts.length);
      }
      await onExecuteCreateGame({
        externalBookingIds: receipts.map((r) => r.externalBookingId),
        bookingSnapshots: receipts.map((r) => ({
          externalBookingId: r.externalBookingId,
          courtId: r.courtId,
          bookingStart: r.bookingStart,
          bookingEnd: r.bookingEnd,
        })),
        hasBookedCourt: true,
      });
      onSuccess();
    } catch (err) {
      const key = axios.isAxiosError(err)
        ? (err.response?.data?.message ?? err.response?.data?.error)
        : null;
      const allConfirmed = receipts.length === bookings.length;
      const isUnknown =
        !allConfirmed &&
        (key === 'weltner.bookingUnknown' ||
          (axios.isAxiosError(err) && (!err.response || err.response.status >= 500)));
      setUnknown(isUnknown);
      setError(
        allConfirmed
          ? t('weltner.gameSaveFailed')
          : isUnknown
            ? t('weltner.bookingUnknown')
            : typeof key === 'string' && key.startsWith('weltner.')
              ? t(key)
              : t(
                  receipts.length === bookings.length
                    ? 'weltner.gameSaveFailed'
                    : 'weltner.bookingRejected',
                ),
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onOpenChange(false);
      }}
      modalId={`weltner-confirm-${club.id}`}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(
              flowMode === 'edit'
                ? 'createGame.booktime.confirmEditTitle'
                : 'createGame.booktime.confirmCreateTitle',
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-6 pb-6">
          <ul className="space-y-2">
            {bookings.map((b) => (
              <li key={b.court.id}>
                {b.court.integrationCourtName || b.court.name} · {formatClubDateKey(b.date, club)} ·{' '}
                {b.startTime} · {b.durationMinutes} {t('weltner.minutes')}
              </li>
            ))}
          </ul>
          <p className="text-sm text-gray-600 dark:text-gray-400">{t('weltner.bookingNotice')}</p>
          {confirmedCount > 0 && (
            <p role="status" className="text-sm">
              {t('weltner.confirmedCount', { count: confirmedCount })}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <button
            type="button"
            disabled={busy || unknown || !bookings.length}
            onClick={() => void confirm()}
            className="w-full rounded-lg bg-primary-600 px-4 py-3 text-white disabled:opacity-50"
          >
            {t(
              busy
                ? 'weltner.booking'
                : confirmedCount === bookings.length && confirmedCount > 0
                  ? 'weltner.saveGame'
                  : 'createGame.booktime.confirmAndCreate',
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
