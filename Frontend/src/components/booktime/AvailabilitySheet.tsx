import { useMemo, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { Club } from '@/types';
import { useBooktimeAvailability } from '@/hooks/useBooktimeAvailability';
import { formatClubDateKey } from '@/integrations/booktime/slots';
import { getClubTimezone } from '@/hooks/useGameTimeDuration';
import {
  BooktimeSlotTakenError,
  buildBookingIsoRange,
  confirmBooktimeBooking,
  loadBooktimeCompany,
  type BooktimePendingBooking,
} from '@/integrations/booktime/bookFlow';
import { getBooktimeClient, hydrateBooktimeSession } from '@/integrations/booktime/session';
import { formatRelativeTime } from '@/utils/dateFormat';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';

type AvailabilitySheetProps = {
  club: Club;
  companyId: string;
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  lastFetchedAt: string | null;
  connected: boolean;
  onConnectRequest: () => void;
  onRefreshSnapshot: (options?: { force?: boolean }) => Promise<boolean>;
  onBooked?: () => void;
  enabled: boolean;
};

function shiftClubDate(date: Date, club: Club, deltaDays: number): Date {
  const key = formatClubDateKey(date, club);
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d + deltaDays, 12, 0, 0);
}

function formatSheetDate(date: Date, club: Club): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: getClubTimezone(club),
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function AvailabilitySheet({
  club,
  companyId,
  selectedDate,
  onDateChange,
  lastFetchedAt,
  connected,
  onConnectRequest,
  onRefreshSnapshot,
  onBooked,
  enabled,
}: AvailabilitySheetProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    durationMinutes,
    setDurationMinutes,
    durations,
    loading,
    error,
    courtRows,
    dateKey,
    minDateKey,
    maxDateKey,
    reload,
  } = useBooktimeAvailability(club, companyId, selectedDate, enabled);

  const [pending, setPending] = useState<BooktimePendingBooking | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceLabel, setPriceLabel] = useState<string | null>(null);
  const [bookSuccess, setBookSuccess] = useState<{
    pending: BooktimePendingBooking;
    bookingId: string;
    bookingStart: string;
    bookingEnd: string;
  } | null>(null);

  const canGoPrev = dateKey > minDateKey;
  const canGoNext = dateKey < maxDateKey;

  useEffect(() => {
    void reload();
  }, [lastFetchedAt, reload]);

  const loadPrice = useCallback(async (booking: BooktimePendingBooking) => {
    setPriceLoading(true);
    setPriceLabel(null);
    try {
      await hydrateBooktimeSession(club.id, companyId);
      const client = getBooktimeClient(club.id, companyId);
      const company = await loadBooktimeCompany(client, companyId);
      const { bookingStart, bookingEnd } = buildBookingIsoRange(
        booking.dateKey,
        booking.startTime,
        booking.durationMinutes
      );
      const resource = company.bookingResources?.find(
        (r) => (r.bookingResourceId ?? r.uuid) === booking.externalCourtId
      );
      const serviceUuid = resource?.serviceUuid;
      if (!serviceUuid) {
        setPriceLabel(t('club.booktime.priceUnavailable'));
        return;
      }
      const quote = await client.getPrice({ bookingStart, bookingEnd, serviceUuid });
      if (quote.price != null) {
        setPriceLabel(
          t('club.booktime.priceLabel', {
            price: quote.price.toLocaleString(),
            currency: quote.currency ?? company.currency ?? 'RSD',
          })
        );
      } else {
        setPriceLabel(t('club.booktime.priceUnavailable'));
      }
    } catch {
      setPriceLabel(t('club.booktime.priceUnavailable'));
    } finally {
      setPriceLoading(false);
    }
  }, [club.id, companyId, t]);

  useEffect(() => {
    if (pending) void loadPrice(pending);
    else setPriceLabel(null);
  }, [pending, loadPrice]);

  const lastSyncLabel = useMemo(() => {
    if (!lastFetchedAt) return t('club.booktime.lastSyncNever');
    return t('club.booktime.lastSync', { time: formatRelativeTime(lastFetchedAt) });
  }, [lastFetchedAt, t]);

  const handleSlotTap = (row: (typeof courtRows)[number], startTime: string) => {
    if (!connected) {
      onConnectRequest();
      return;
    }
    setPending({
      clubId: club.id,
      courtId: row.court.id,
      externalCourtId: row.externalCourtId,
      courtName: row.court.name,
      dateKey,
      startTime,
      durationMinutes,
    });
  };

  const handleConfirmBook = async () => {
    if (!pending) return;
    setConfirmBusy(true);
    try {
      await hydrateBooktimeSession(club.id, companyId);
      const client = getBooktimeClient(club.id, companyId);
      const result = await confirmBooktimeBooking(
        client,
        club,
        companyId,
        pending,
        selectedDate,
        { refreshSnapshot: onRefreshSnapshot, lastFetchedAt }
      );
      setPending(null);
      setBookSuccess({
        pending,
        bookingId: result.bookingId,
        bookingStart: result.bookingStart,
        bookingEnd: result.bookingEnd,
      });
      toast.success(t('club.booktime.bookSuccess'));
      await reload();
      onBooked?.();
    } catch (err) {
      if (err instanceof BooktimeSlotTakenError) {
        toast.error(t('club.booktime.slotTaken'));
        setPending(null);
        await reload();
        return;
      }
      toast.error(t('club.booktime.bookFailed'));
    } finally {
      setConfirmBusy(false);
    }
  };

  const openCreateGame = () => {
    if (!bookSuccess) return;
    const { pending: booked, bookingId, bookingStart, bookingEnd } = bookSuccess;
    const params = new URLSearchParams({
      clubId: booked.clubId,
      courtId: booked.courtId,
      hasBookedCourt: '1',
      externalBookingId: bookingId,
      externalBookingProvider: 'BOOKTIME',
      startTime: bookingStart,
      endTime: bookingEnd,
    });
    setBookSuccess(null);
    navigate(`/create-game?${params.toString()}`, { state: { entityType: 'GAME' } });
  };

  if (!enabled) return null;

  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 p-3 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            {t('club.booktime.availabilityTitle')}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{lastSyncLabel}</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-0.5">
          {durations.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDurationMinutes(d)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                durationMinutes === d
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {t('club.booktime.durationMinutes', { count: d })}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={!canGoPrev}
          onClick={() => onDateChange(shiftClubDate(selectedDate, club, -1))}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 disabled:opacity-40"
          aria-label={t('club.booktime.prevDay')}
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{formatSheetDate(selectedDate, club)}</span>
        <button
          type="button"
          disabled={!canGoNext}
          onClick={() => onDateChange(shiftClubDate(selectedDate, club, 1))}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 disabled:opacity-40"
          aria-label={t('club.booktime.nextDay')}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-6 justify-center text-sm text-gray-500 dark:text-gray-400">
          <Loader2 size={16} className="animate-spin" />
          {t('common.loading')}
        </div>
      ) : error ? (
        <p className="text-sm text-red-600 dark:text-red-400 py-2">{t('club.booktime.availabilityLoadFailed')}</p>
      ) : courtRows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-2">{t('club.booktime.noMappedCourts')}</p>
      ) : (
        <div className="space-y-4">
          {courtRows.map((row) => (
            <div key={row.court.id}>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">{row.court.name}</p>
              {row.freeSlots.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('club.booktime.noFreeSlots')}</p>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                  {row.freeSlots.map((startTime) => (
                    <button
                      key={`${row.court.id}-${startTime}`}
                      type="button"
                      onClick={() => handleSlotTap(row, startTime)}
                      className="h-9 rounded-lg border border-primary-200 dark:border-primary-800 bg-white dark:bg-gray-800 text-xs font-medium text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-950/40 transition-colors"
                    >
                      {startTime}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!connected ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">{t('club.booktime.bookRequiresConnect')}</p>
      ) : null}

      <Dialog open={!!pending} onOpenChange={(open) => !open && !confirmBusy && setPending(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('club.booktime.confirmBookTitle')}</DialogTitle>
          </DialogHeader>
          {pending ? (
            <div className="px-6 pb-6 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {t('club.booktime.confirmBookBody', {
                  court: pending.courtName,
                  time: pending.startTime,
                  duration: pending.durationMinutes,
                  date: pending.dateKey,
                })}
              </p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {priceLoading ? (
                  <span className="inline-flex items-center gap-2 text-gray-500">
                    <Loader2 size={14} className="animate-spin" />
                    {t('club.booktime.loadingPrice')}
                  </span>
                ) : (
                  priceLabel ?? t('club.booktime.priceUnavailable')
                )}
              </p>
              <button
                type="button"
                disabled={confirmBusy || priceLoading}
                onClick={() => void handleConfirmBook()}
                className="btn-primary w-full inline-flex items-center justify-center gap-2"
              >
                {confirmBusy ? <Loader2 size={16} className="animate-spin" /> : null}
                {t('club.booktime.confirmBookCta')}
              </button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!bookSuccess} onOpenChange={(open) => !open && setBookSuccess(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('club.booktime.bookSuccessTitle')}</DialogTitle>
          </DialogHeader>
          {bookSuccess ? (
            <div className="px-6 pb-6 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {t('club.booktime.bookSuccessBody', { court: bookSuccess.pending.courtName })}
              </p>
              <button type="button" onClick={openCreateGame} className="btn-primary w-full">
                {t('club.booktime.createGameHere')}
              </button>
              <button
                type="button"
                onClick={() => setBookSuccess(null)}
                className="w-full text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                {t('common.close')}
              </button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
