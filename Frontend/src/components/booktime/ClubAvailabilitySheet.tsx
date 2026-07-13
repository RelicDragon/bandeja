import { useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { Club } from '@/types';
import { useClubAvailability } from '@/hooks/useClubAvailability';
import { formatClubDateKey } from '@/integrations/booktime/slots';
import { getClubTimezone } from '@/hooks/useGameTimeDuration';
import { buildBookingIsoRange } from '@/integrations/booktime/bookFlow';
import { formatRelativeTime } from '@/utils/dateFormat';
import { CourtDisplayName } from '@/components/CourtDisplayName';

type ClubAvailabilitySheetProps = {
  club: Club;
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

export function ClubAvailabilitySheet({
  club,
  selectedDate,
  onDateChange,
  lastFetchedAt,
  connected,
  onConnectRequest,
  enabled,
}: ClubAvailabilitySheetProps) {
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
  } = useClubAvailability(club, selectedDate, enabled);

  const canGoPrev = dateKey > minDateKey;
  const canGoNext = maxDateKey.length > 0 && dateKey < maxDateKey;

  useEffect(() => {
    void reload();
  }, [lastFetchedAt, reload]);

  const lastSyncLabel = useMemo(() => {
    if (!lastFetchedAt) return t('club.booktime.lastSyncNever');
    return t('club.booktime.lastSync', { time: formatRelativeTime(lastFetchedAt) });
  }, [lastFetchedAt, t]);

  const openCreateGameForSlot = (courtId: string, startTime: string) => {
    const { bookingStart, bookingEnd } = buildBookingIsoRange(dateKey, startTime, durationMinutes);
    const params = new URLSearchParams({
      clubId: club.id,
      courtId,
      startTime: bookingStart,
      endTime: bookingEnd,
    });
    navigate(`/create-game?${params.toString()}`, { state: { entityType: 'GAME' } });
  };

  const handleSlotTap = (courtId: string, startTime: string) => {
    if (!connected) {
      onConnectRequest();
      return;
    }
    openCreateGameForSlot(courtId, startTime);
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
              <div className="mb-2">
                <CourtDisplayName
                  name={row.court.name}
                  integrationName={row.court.integrationCourtName}
                  primaryClassName="text-xs font-medium text-gray-600 dark:text-gray-300"
                  secondaryClassName="text-[10px] text-gray-500 dark:text-gray-400"
                />
              </div>
              {row.freeSlots.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('club.booktime.noFreeSlots')}</p>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                  {row.freeSlots.map((startTime) => (
                    <button
                      key={`${row.court.id}-${startTime}`}
                      type="button"
                      onClick={() => handleSlotTap(row.court.id, startTime)}
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

      <p className="text-xs text-gray-500 dark:text-gray-400">
        {connected ? t('club.booktime.browseSlotHint') : t('club.booktime.bookRequiresConnect')}
      </p>
    </section>
  );
}
