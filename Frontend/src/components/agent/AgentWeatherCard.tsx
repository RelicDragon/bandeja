import { memo, useMemo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Droplets, Wind } from 'lucide-react';
import type { AgentWeatherCard as AgentWeatherCardData, AgentWeatherCardHour } from '@shared/agentContract';
import type { WeatherConditionKey } from '@/types';
import { WeatherIcon } from '@/components/weather/WeatherIcon';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { formatWeatherPrecipitationAmount, getWeatherTemperatureTextColors, shouldUseFahrenheit } from '@/utils/weather';
import {
  agentToolCardPath,
  formatCardClock,
  formatCardDate,
  formatCardTemperature,
  isInBestWindow,
  weatherHeadlineHour,
  weatherVerdictTone,
} from '@/features/agent/agentToolCards';
import { AgentCardPill, AgentCardShell } from './AgentCardShell';

const CONDITIONS = new Set<WeatherConditionKey>([
  'clear',
  'mainly_clear',
  'partly_cloudy',
  'cloudy',
  'fog',
  'drizzle',
  'rain',
  'freezing_rain',
  'snow',
  'showers',
  'thunderstorm',
]);

/** "18:00–19:30" isolated left-to-right so an RTL sentence doesn't flip the range. */
const ltrRange = (from: string, to: string) => `\u2066${from}–${to}\u2069`;

/** Light / dark temperature colours as CSS variables; the `dark` class picks one. */
function temperatureStyle(tempC: number): CSSProperties {
  const { light, dark } = getWeatherTemperatureTextColors(tempC);
  return { '--agent-temp': light, '--agent-temp-dark': dark } as CSSProperties;
}

const conditionOf = (key: string): WeatherConditionKey => (CONDITIONS.has(key as WeatherConditionKey) ? (key as WeatherConditionKey) : 'unknown');

function HourColumn({
  hour,
  label,
  locale,
  fahrenheit,
  archive,
  flagged,
  best,
}: {
  hour: AgentWeatherCardHour;
  label: string;
  locale: string;
  fahrenheit: boolean;
  archive: boolean;
  /** Rain / wind risk this hour (forecast with a verdict only). */
  flagged: boolean;
  best: boolean;
}) {
  const rain = archive ? hour.rainMm : hour.rainChancePct;
  const wet = rain != null && rain > 0;
  return (
    <li
      className={`flex w-14 flex-shrink-0 snap-start flex-col items-center gap-1 rounded-xl px-1 py-1.5 ${
        flagged
          ? 'bg-amber-50 dark:bg-amber-900/20'
          : best
            ? 'bg-emerald-50 dark:bg-emerald-900/20'
            : 'bg-gray-50 dark:bg-gray-900/40'
      }`}
    >
      <span className="text-[11px] tabular-nums text-gray-500 dark:text-gray-400">{label}</span>
      <WeatherIcon conditionKey={conditionOf(hour.condition)} isDay={hour.isDay} size={18} />
      <span
        className="text-sm font-semibold tabular-nums text-[color:var(--agent-temp)] dark:text-[color:var(--agent-temp-dark)]"
        style={temperatureStyle(hour.tempC)}
      >
        {formatCardTemperature(hour.tempC, fahrenheit)}
      </span>
      <span
        className={`inline-flex items-center gap-0.5 text-[10px] tabular-nums ${
          wet ? 'font-medium text-sky-600 dark:text-sky-300' : 'text-gray-400 dark:text-gray-500'
        }`}
      >
        <Droplets size={10} aria-hidden />
        {rain == null ? '–' : archive ? `${formatWeatherPrecipitationAmount(rain, locale)} mm` : `${Math.round(rain)}%`}
      </span>
      {hour.windKmh != null ? (
        <span className="inline-flex items-center gap-0.5 text-[10px] tabular-nums text-gray-400 dark:text-gray-500">
          <Wind size={10} aria-hidden />
          {hour.windKmh}
        </span>
      ) : null}
    </li>
  );
}

/** Forecast for a game or a day: hourly icons, temperature, rain, wind and a "good to play" hint. */
export const AgentWeatherCard = memo(function AgentWeatherCard({ card }: { card: AgentWeatherCardData }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const settings = useMemo(() => resolveDisplaySettings(user), [user]);
  const fahrenheit = shouldUseFahrenheit(settings.locale);
  const clock = (hhmm: string) => formatCardClock(hhmm, settings.locale, settings.hour12);
  const headline = weatherHeadlineHour(card);
  const archive = card.source === 'archive';
  const dateLabel = card.date ? formatCardDate(card.date, settings.locale) : null;
  const subtitle = [
    dateLabel,
    card.window ? ltrRange(clock(card.window.start), clock(card.window.end)) : null,
    card.gameId ? card.place : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const showRisk = card.verdict != null && card.verdict !== 'indoor';

  return (
    <AgentCardShell
      icon={headline ? <WeatherIcon conditionKey={conditionOf(headline.condition)} isDay={headline.isDay} size={22} /> : null}
      iconClassName="bg-sky-50 dark:bg-sky-900/30"
      title={card.gameTitle || card.place}
      subtitle={subtitle}
      pill={
        card.verdict ? (
          <AgentCardPill tone={weatherVerdictTone(card.verdict)}>{t(`agent.cards.weather.verdict.${card.verdict}`)}</AgentCardPill>
        ) : archive ? (
          <AgentCardPill tone="info">{t('agent.cards.weather.recorded')}</AgentCardPill>
        ) : null
      }
      path={agentToolCardPath(card)}
    >
      {card.bestWindow ? (
        <p className="mb-2 text-xs text-emerald-700 dark:text-emerald-300">
          {t('agent.cards.weather.bestWindow', { range: ltrRange(clock(card.bestWindow.start), clock(card.bestWindow.end)) })}
        </p>
      ) : null}
      <ul className="-mx-1 flex snap-x gap-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
        {card.hours.map((hour) => (
          <HourColumn
            key={hour.time}
            hour={hour}
            label={clock(hour.time)}
            locale={settings.locale}
            fahrenheit={fahrenheit}
            archive={archive}
            flagged={showRisk && !hour.playable}
            best={isInBestWindow(card, hour)}
          />
        ))}
      </ul>
      {card.stale ? <p className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">{t('agent.cards.weather.stale')}</p> : null}
    </AgentCardShell>
  );
});
