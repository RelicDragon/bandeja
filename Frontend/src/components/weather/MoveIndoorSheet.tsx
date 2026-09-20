/**
 * PRD 357 — "Move indoor": pick a free indoor court at the same club.
 *
 * Applying the change goes through the **existing** edit path
 * (`saveLocationTime` → `PUT /games/:id` + `POST /game-courts/game/:id`), so
 * there is no parallel court-writing code anywhere in this feature.
 *
 * A linked external booking is never rebooked or cancelled — when the game has
 * one, the sheet says so in words before the organizer commits.
 */
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, Check, Clock, Home, Loader2 } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/Drawer';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { queryKeys } from '@/queries/queryKeys';
import { gameWeatherApi, type IndoorAlternativeCourt } from '@/api/gameWeather';
import { saveLocationTime } from '@/components/gameLocationTime/useSaveGameLocationTime';
import { formatClockTime } from '@/features/weather-alerts/weatherRiskDisplay';
import { planIndoorCourtSwap } from '@/features/weather-alerts/planIndoorCourtSwap';
import type { Game } from '@/types';

interface MoveIndoorSheetProps {
  game: Game;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the court change lands, so the banner can collapse. */
  onMoved: () => void;
  /** The fallback when nothing is free. */
  onChangeTime: () => void;
  timeZone?: string | null;
}

const ROW =
  'flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-start transition-colors';

export function MoveIndoorSheet({
  game,
  open,
  onOpenChange,
  onMoved,
  onChangeTime,
  timeZone,
}: MoveIndoorSheetProps) {
  const { t, i18n } = useTranslation();
  const [pendingCourtId, setPendingCourtId] = useState<string | null>(null);
  useBackButtonModal(open, () => onOpenChange(false), `move-indoor-${game.id}`);

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.weatherAlerts.indoorAlternatives(game.id),
    queryFn: async () => (await gameWeatherApi.getIndoorAlternatives(game.id)).data,
    enabled: open,
    staleTime: 60_000,
  });

  const startLabel = useMemo(
    () => formatClockTime(game.startTime, i18n.language, { timeZone }),
    [game.startTime, i18n.language, timeZone],
  );

  const freeCourts = data?.courts.filter((court) => court.isFree) ?? [];
  const hasCourts = (data?.courts.length ?? 0) > 0;

  const currentCourts = useMemo(() => data?.currentCourts ?? [], [data?.currentCourts]);

  const apply = useCallback(
    async (court: IndoorAlternativeCourt) => {
      if (pendingCourtId) return;
      setPendingCourtId(court.id);
      try {
        // Replace only the outdoor court being moved: `courtIds` overwrites the
        // whole set, so the game's other courts have to be carried over.
        const courtIds = planIndoorCourtSwap(currentCourts, court.id);
        await saveLocationTime(game.id, {
          courtId: courtIds[0],
          courtIds,
          addBookingIds: [],
          removeBookingIds: [],
        });
        // The chat line is a courtesy, not part of the move: a failure here must
        // not make a successful court change look like it failed.
        await gameWeatherApi.noteMovedIndoor(game.id, court.id).catch(() => undefined);
        toast.success(t('weatherAlerts.moved', { court: court.name }));
        onOpenChange(false);
        onMoved();
      } catch {
        toast.error(t('weatherAlerts.moveFailed'));
      } finally {
        setPendingCourtId(null);
      }
    },
    [currentCourts, game.id, onMoved, onOpenChange, pendingCourtId, t],
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className="mx-auto max-w-lg px-4 pb-8"
        accessibleTitle={t('weatherAlerts.moveIndoorTitle')}
      >
        <DrawerHeader className="text-start">
          <DrawerTitle>{t('weatherAlerts.moveIndoorTitle')}</DrawerTitle>
          <DrawerDescription>{t('weatherAlerts.moveIndoorSubtitle')}</DrawerDescription>
        </DrawerHeader>

        {data && data.totalCourtCount > 1 && data.outdoorCourtCount > 0 && (
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            {t('weatherAlerts.courtsOutdoor', {
              count: data.outdoorCourtCount,
              total: data.totalCourtCount,
            })}
          </p>
        )}

        {data?.hasLinkedBooking && data.linkedBookingCourtNames.length > 0 && (
          <p className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              {t('weatherAlerts.bookingWarning', {
                courts: data.linkedBookingCourtNames.join(', '),
              })}
            </span>
          </p>
        )}

        <div aria-live="polite">
          {isLoading && (
            <p className="flex items-center gap-2 py-6 text-sm text-gray-500 dark:text-gray-400">
              <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              {t('weatherAlerts.loadingCourts')}
            </p>
          )}

          {!isLoading && isError && (
            <p className="py-6 text-sm text-red-600 dark:text-red-400">
              {t('weatherAlerts.loadFailed')}
            </p>
          )}

          {!isLoading && !isError && !hasCourts && (
            <p className="py-6 text-sm text-gray-500 dark:text-gray-400">
              {t('weatherAlerts.noIndoorCourts')}
            </p>
          )}

          {!isLoading && !isError && hasCourts && freeCourts.length === 0 && (
            <p className="py-4 text-sm text-gray-600 dark:text-gray-300">
              {t('weatherAlerts.noneFree', { time: startLabel })}
            </p>
          )}

          {!isLoading && !isError && hasCourts && (
            <ul className="space-y-2">
              {data!.courts.map((court) => {
                const label = court.isFree
                  ? t('weatherAlerts.courtFreeAnnouncement', { court: court.name })
                  : t('weatherAlerts.courtBusyAnnouncement', { court: court.name });
                return (
                  <li key={court.id}>
                    <button
                      type="button"
                      disabled={!court.isFree || pendingCourtId !== null}
                      aria-label={label}
                      onClick={() => void apply(court)}
                      className={`${ROW} ${
                        court.isFree
                          ? 'border-gray-200 bg-white hover:border-primary-300 hover:bg-primary-50/50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-primary-700 dark:hover:bg-primary-950/30'
                          : 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-70 dark:border-gray-700 dark:bg-gray-800/40'
                      }`}
                    >
                      <span className="flex items-center gap-2 text-gray-900 dark:text-white">
                        <Home size={16} aria-hidden="true" />
                        {court.name}
                      </span>
                      <span
                        aria-hidden="true"
                        className={`text-xs font-medium ${
                          court.isFree
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {pendingCourtId === court.id ? (
                          <Loader2 size={14} className="animate-spin motion-reduce:animate-none" />
                        ) : court.isFree ? (
                          <span className="flex items-center gap-1">
                            <Check size={14} />
                            {t('weatherAlerts.free')}
                          </span>
                        ) : (
                          t('weatherAlerts.busy')
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {!isLoading && !isError && freeCourts.length === 0 && (
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onChangeTime();
            }}
            className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2 font-medium text-white transition-colors hover:bg-primary-700"
          >
            <Clock size={16} aria-hidden="true" />
            {t('weatherAlerts.changeTime')}
          </button>
        )}
      </DrawerContent>
    </Drawer>
  );
}
