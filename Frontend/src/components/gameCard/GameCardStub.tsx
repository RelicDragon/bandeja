import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarOff, Trophy } from 'lucide-react';
import type { GameStatus, WeatherSummary } from '@/types';
import type { GameCardTicketTheme } from '@/utils/gameCardEntityTheme';
import { WeatherIcon } from '@/components/weather/WeatherIcon';
import { formatWeatherTemperature, getWeatherConditionLabel, getWeatherTemperatureColor } from '@/utils/weather';

interface GameCardStubProps {
  theme: GameCardTicketTheme;
  status: GameStatus;
  startTime: Date | string;
  /** Club-timezone start, already formatted for the viewer's 12/24 h preference. */
  startText: string | null;
  endText: string | null;
  /** "Today" / "Tomorrow" / "Yesterday", or null when further away. */
  dayLabel: string | null;
  timeNotSet: boolean;
  isLeagueSeason: boolean;
  timezone: string | null;
  locale: string;
  weatherSummary: WeatherSummary | null;
  onWeatherClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/**
 * Splits "6:30 PM" into the digits and a trailing meridiem so the stub can set
 * the meridiem small; a 24 h time (or a locale that leads with it) is returned whole.
 */
function splitMeridiem(text: string): { main: string; suffix: string | null } {
  const match = /^([\d:.\s]*\d)\s*([^\d\s:.]+)$/u.exec(text.trim());
  if (!match) return { main: text, suffix: null };
  return { main: match[1], suffix: match[2] };
}

/** The ticket stub: answers "when" — the first thing every player looks for. */
function GameCardStubInner({
  theme,
  status,
  startTime,
  startText,
  endText,
  dayLabel,
  timeNotSet,
  isLeagueSeason,
  timezone,
  locale,
  weatherSummary,
  onWeatherClick,
}: GameCardStubProps) {
  const { t } = useTranslation();

  const dateParts = useMemo(() => {
    const d = typeof startTime === 'string' ? new Date(startTime) : startTime;
    if (Number.isNaN(d.getTime())) return null;
    const tz = timezone ?? undefined;
    return {
      weekday: new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: 'short' }).format(d),
      date: new Intl.DateTimeFormat(locale, { timeZone: tz, day: 'numeric', month: 'short' }).format(d),
    };
  }, [startTime, timezone, locale]);

  const eyebrowClass = 'text-[10px] font-semibold uppercase leading-none tracking-[0.1em]';

  let content: React.ReactNode;
  if (isLeagueSeason) {
    content = (
      <>
        <Trophy size={24} strokeWidth={1.75} className={theme.ink} aria-hidden />
      </>
    );
  } else if (timeNotSet) {
    content = (
      <>
        <CalendarOff size={22} strokeWidth={1.75} className="text-gray-400 dark:text-gray-500" aria-hidden />
        <span className="mt-1.5 line-clamp-3 text-[10.5px] font-medium leading-tight text-gray-500 dark:text-gray-400">
          {t('gameDetails.datetimeNotSet')}
        </span>
      </>
    );
  } else {
    let top: React.ReactNode;
    if (status === 'STARTED') {
      top = (
        <span className={`flex items-center gap-1.5 text-rose-600 dark:text-rose-400 ${eyebrowClass}`}>
          <span className="gc-live-dot h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
          <span className="truncate">{t('games.status.started')}</span>
        </span>
      );
    } else if (status === 'FINISHED' || status === 'ARCHIVED') {
      top = (
        <span className={`truncate text-gray-500 dark:text-gray-400 ${eyebrowClass}`}>
          {t(status === 'FINISHED' ? 'games.status.finished' : 'games.status.archived')}
        </span>
      );
    } else {
      top = (
        <span className={`truncate ${eyebrowClass} ${theme.ink}`}>
          {dayLabel ?? dateParts?.weekday}
        </span>
      );
    }

    const start = startText ? splitMeridiem(startText) : null;
    // A relative day label replaces the weekday, so the calendar date is only
    // needed when the game is further away — or already played.
    const showDate = Boolean(dateParts) && (!dayLabel || status === 'FINISHED' || status === 'ARCHIVED');

    content = (
      <>
        {top}
        {start ? (
          <span className="mt-1 whitespace-nowrap font-brand text-[22px] font-semibold leading-none tracking-tight tabular-nums text-gray-900 dark:text-white">
            {start.main}
            {start.suffix ? (
              <span className="ms-0.5 text-[11px] font-semibold tracking-normal">{start.suffix}</span>
            ) : null}
          </span>
        ) : null}
        {endText ? (
          <span className="mt-1 whitespace-nowrap text-[11px] font-medium tabular-nums text-gray-500 dark:text-gray-400">
            – {endText}
          </span>
        ) : null}
        {showDate ? (
          <span className="mt-0.5 whitespace-nowrap text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {dateParts?.date}
          </span>
        ) : null}
        {weatherSummary ? (
          <StubWeather summary={weatherSummary} locale={locale} onClick={onWeatherClick} />
        ) : null}
      </>
    );
  }

  return (
    <div
      className={`flex w-[78px] shrink-0 flex-col items-center justify-center px-1.5 py-3 text-center ${theme.stub}`}
    >
      {content}
    </div>
  );
}

function StubWeather({
  summary,
  locale,
  onClick,
}: {
  summary: WeatherSummary;
  locale: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const { t } = useTranslation();
  const tempLabel = formatWeatherTemperature(summary, { locale });
  const conditionLabel = getWeatherConditionLabel(t, summary.conditionKey);
  const temperatureColor = getWeatherTemperatureColor(summary);
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={stop}
      onMouseDown={stop}
      className="relative mt-2 inline-flex min-h-[22px] items-center gap-1 rounded-full bg-white/75 px-1.5 text-[11px] font-semibold tabular-nums leading-none ring-1 ring-black/[0.04] transition-colors hover:bg-white dark:bg-white/10 dark:ring-white/10 dark:hover:bg-white/15"
      aria-label={t('weather.openForecast', {
        condition: conditionLabel,
        temperature: tempLabel,
        defaultValue: 'Open weather forecast: {{temperature}}, {{condition}}',
      })}
      title={`${tempLabel} ${conditionLabel}`.trim()}
    >
      <WeatherIcon conditionKey={summary.conditionKey} isDay={summary.isDay} size={12} className="shrink-0" />
      <span style={{ color: temperatureColor.textColor }}>{tempLabel}</span>
      {summary.stale ? (
        <span className="absolute -end-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />
      ) : null}
    </button>
  );
}

export const GameCardStub = memo(GameCardStubInner);
