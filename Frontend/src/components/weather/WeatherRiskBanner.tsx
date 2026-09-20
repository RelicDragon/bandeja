/**
 * PRD 357 — the weather risk banner on game details.
 *
 * Renders **nothing** when the game is indoor, when the courts are unknown, or
 * when there is simply no forecast. There is deliberately no "no data" state:
 * silence is the correct output for "we do not know".
 *
 * Amber = rain, slate = wind, both with dark-mode variants. Every motion path
 * (the 200 ms fade, the 40 ms icon stagger, the 240 ms collapse) is gated on
 * `usePrefersReducedMotion`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CloudRain, Home, Clock, MessageSquare, ShieldCheck, Wind } from 'lucide-react';
import { chatApi } from '@/api/chat';
import { gameWeatherApi } from '@/api/gameWeather';
import { queryKeys } from '@/queries/queryKeys';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { useGameWeatherQuery } from '@/queries/weather';
import { WeatherIcon } from '@/components/weather/WeatherIcon';
import { GameWeatherDialog } from '@/components/weather/GameWeatherDialog';
import { MoveIndoorSheet } from '@/components/weather/MoveIndoorSheet';
import {
  formatClockTime,
  formatPercent,
  formatWindSpeed,
  hourlyStripWindow,
  weatherRiskLabelKey,
  weatherRiskTone,
} from '@/features/weather-alerts/weatherRiskDisplay';
import type { Game } from '@/types';

const FADE_MS = 200;
const STAGGER_MS = 40;
const COLLAPSE_MS = 240;

const TONE_SURFACE: Record<'rain' | 'wind' | 'kept', string> = {
  rain: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100',
  wind: 'border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100',
  kept: 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-400',
};

const CHIP =
  'inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-white dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/20';

interface WeatherRiskBannerProps {
  game: Game;
  /** Organizers get the three fixing chips; everyone else gets Forecast. */
  isOrganizer: boolean;
  /** Opens `EditGameInfoModal` on the time section. */
  onChangeTime: () => void;
  locale: string;
  hour12?: boolean;
  /** Set by `?section=weather&action=moveIndoor`; opens the sheet once. */
  autoOpenMoveIndoor?: boolean;
  /** Set by `?section=weather`; brings the banner on screen once. */
  autoScrollIntoView?: boolean;
  /** Called once the deep-link intent has been consumed. */
  onAutoOpenConsumed?: () => void;
}

export function WeatherRiskBanner({
  game,
  isOrganizer,
  onChangeTime,
  locale,
  hour12,
  autoOpenMoveIndoor = false,
  autoScrollIntoView = false,
  onAutoOpenConsumed,
}: WeatherRiskBannerProps) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const queryClient = useQueryClient();
  // Callback ref: the same handle is attached to a `<p>` or a `<section>`
  // depending on the state, and a `RefObject<HTMLElement>` fits neither.
  const bannerRef = useRef<HTMLElement | null>(null);
  const setBannerRef = useCallback((node: HTMLElement | null) => {
    bannerRef.current = node;
  }, []);
  const [moveIndoorOpen, setMoveIndoorOpen] = useState(false);
  const [forecastOpen, setForecastOpen] = useState(false);
  const timeZone = game.city?.timezone ?? null;
  const lastWeatherAlertUpdated = useSocketEventsStore(
    (state) => state.lastGameWeatherAlertUpdated,
  );

  const { data: riskState } = useQuery({
    queryKey: queryKeys.weatherAlerts.game(game.id),
    queryFn: async () => (await gameWeatherApi.getAlertState(game.id)).data,
    enabled: Boolean(game.id) && game.timeIsSet !== false,
    staleTime: 5 * 60_000,
  });

  const atRisk = Boolean(riskState && riskState.outdoor && riskState.severity !== 'none');
  const kept = riskState?.keptAsPlanned === true;

  const { data: forecastWindow } = useGameWeatherQuery(game.id, atRisk && !kept);

  const keepMutation = useMutation({
    mutationFn: async () => (await gameWeatherApi.keepAsPlanned(game.id)).data,
    onSuccess: (next) => {
      queryClient.setQueryData(queryKeys.weatherAlerts.game(game.id), next);
    },
    onError: () => toast.error(t('weatherAlerts.moveFailed')),
  });

  const pollMutation = useMutation({
    mutationFn: async () =>
      chatApi.createMessage({
        chatContextType: 'GAME',
        contextId: game.id,
        chatType: 'PUBLIC',
        content: t('weatherAlerts.pollQuestion'),
        poll: {
          question: t('weatherAlerts.pollQuestion'),
          type: 'CLASSICAL',
          isAnonymous: false,
          allowsMultipleAnswers: false,
          options: [t('weatherAlerts.pollYes'), t('weatherAlerts.pollNo')],
        },
      }),
    onSuccess: () => toast.success(t('weatherAlerts.pollPosted')),
    onError: () => toast.error(t('weatherAlerts.pollFailed')),
  });

  const handleMoved = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.weatherAlerts.game(game.id) });
  }, [game.id, queryClient]);

  // The game room is already retained by `GameDetailsShell`; this only reacts
  // to the scheduler (or another organizer) changing the severity.
  useEffect(() => {
    if (!lastWeatherAlertUpdated || lastWeatherAlertUpdated.gameId !== game.id) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.weatherAlerts.game(game.id) });
  }, [game.id, lastWeatherAlertUpdated, queryClient]);

  useEffect(() => {
    if (!autoOpenMoveIndoor || !atRisk) return;
    if (isOrganizer) setMoveIndoorOpen(true);
    onAutoOpenConsumed?.();
  }, [atRisk, autoOpenMoveIndoor, isOrganizer, onAutoOpenConsumed]);

  /**
   * `?section=weather` with no action — the "View forecast" push button every
   * participant gets. The banner can sit well below the fold on a long game
   * page, so bring it on screen instead of silently dropping the intent.
   */
  useEffect(() => {
    if (!autoScrollIntoView || !atRisk) return;
    const node = bannerRef.current;
    if (!node) return;
    node.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'center',
    });
    onAutoOpenConsumed?.();
  }, [atRisk, autoScrollIntoView, onAutoOpenConsumed, reducedMotion]);

  const strip = useMemo(
    () => hourlyStripWindow(forecastWindow?.hours ?? [], game.startTime),
    [forecastWindow?.hours, game.startTime],
  );

  if (!riskState || !atRisk) return null;

  const tone = weatherRiskTone(riskState);
  const time = formatClockTime(riskState.at, locale, { timeZone, hour12 });
  const headline = t(weatherRiskLabelKey(riskState.severity, tone));
  const detail =
    tone === 'wind'
      ? t('weatherAlerts.detailWind', { wind: formatWindSpeed(riskState.windKph, locale), time })
      : t('weatherAlerts.detailRain', { pop: formatPercent(riskState.pop, locale), time });
  const HeadIcon = tone === 'wind' ? Wind : CloudRain;

  const transition = reducedMotion
    ? { duration: 0 }
    : { duration: FADE_MS / 1000, ease: 'easeOut' as const };
  const collapse = reducedMotion
    ? { duration: 0 }
    : { duration: COLLAPSE_MS / 1000, ease: 'easeInOut' as const };

  return (
    <div className="contents">
      <AnimatePresence initial={false} mode="wait">
        {kept ? (
          <motion.p
            ref={setBannerRef}
            key="kept"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={collapse}
            className={`mb-3 flex items-center gap-2 overflow-hidden rounded-xl border px-3 py-2 text-sm ${TONE_SURFACE.kept}`}
          >
            <ShieldCheck size={16} aria-hidden="true" />
            {t('weatherAlerts.playingRainOrShine')}
          </motion.p>
        ) : (
          <motion.section
            ref={setBannerRef}
            key="risk"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, height: 0 }}
            transition={transition}
            aria-label={headline}
            className={`mb-3 overflow-hidden rounded-xl border px-3 py-3 ${TONE_SURFACE[tone]}`}
          >
            <div className="flex items-center gap-2">
              <HeadIcon size={18} aria-hidden="true" />
              <p className="text-sm font-semibold">
                {headline} · {detail}
              </p>
            </div>

            {strip.length > 0 && (
              <ul
                aria-label={t('weatherAlerts.hourlyStripLabel')}
                className="mt-2 flex items-center gap-3"
              >
                {strip.map((hour, index) => (
                  <motion.li
                    key={hour.time}
                    initial={reducedMotion ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={
                      reducedMotion
                        ? { duration: 0 }
                        : { duration: 0.18, delay: (index * STAGGER_MS) / 1000 }
                    }
                    className="flex flex-col items-center gap-0.5 text-[11px]"
                  >
                    <WeatherIcon conditionKey={hour.conditionKey} isDay={hour.isDay} size={18} />
                    <span>{formatClockTime(hour.time, locale, { timeZone, hour12 })}</span>
                  </motion.li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {isOrganizer ? (
                <>
                  <button type="button" className={CHIP} onClick={() => setMoveIndoorOpen(true)}>
                    <Home size={16} aria-hidden="true" />
                    {t('weatherAlerts.moveIndoor')}
                  </button>
                  <button type="button" className={CHIP} onClick={onChangeTime}>
                    <Clock size={16} aria-hidden="true" />
                    {t('weatherAlerts.changeTime')}
                  </button>
                  <button
                    type="button"
                    className={CHIP}
                    disabled={keepMutation.isPending}
                    onClick={() => keepMutation.mutate()}
                  >
                    <ShieldCheck size={16} aria-hidden="true" />
                    {t('weatherAlerts.keepAsPlanned')}
                  </button>
                  <button
                    type="button"
                    className={CHIP}
                    disabled={pollMutation.isPending}
                    onClick={() => pollMutation.mutate()}
                  >
                    <MessageSquare size={16} aria-hidden="true" />
                    {t('weatherAlerts.askTheGroup')}
                  </button>
                </>
              ) : (
                <button type="button" className={CHIP} onClick={() => setForecastOpen(true)}>
                  <CloudRain size={16} aria-hidden="true" />
                  {t('weatherAlerts.forecast')}
                </button>
              )}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {isOrganizer && (
        <MoveIndoorSheet
          game={game}
          open={moveIndoorOpen}
          onOpenChange={setMoveIndoorOpen}
          onMoved={handleMoved}
          onChangeTime={onChangeTime}
          timeZone={timeZone}
        />
      )}

      <GameWeatherDialog
        game={game}
        open={forecastOpen}
        onClose={() => setForecastOpen(false)}
        locale={locale}
        hour12={hour12 ?? false}
      />
    </div>
  );
}
