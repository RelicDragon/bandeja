import { useTranslation } from 'react-i18next';
import type { WeatherSummary } from '@/types';
import { formatWeatherTemperature, getWeatherConditionLabel } from '@/utils/weather';
import { WeatherIcon } from './WeatherIcon';

interface WeatherSummaryChipProps {
  summary: WeatherSummary;
  locale?: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

export function WeatherSummaryChip({ summary, locale, onClick }: WeatherSummaryChipProps) {
  const { t } = useTranslation();
  const label = getWeatherConditionLabel(t, summary.conditionKey);
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-sky-200/80 bg-sky-50/90 px-2 text-[11px] font-semibold text-sky-700 shadow-sm shadow-sky-500/10 transition-all duration-200 hover:-translate-y-px hover:border-sky-300 hover:bg-sky-100 dark:border-sky-700/60 dark:bg-sky-950/40 dark:text-sky-200 dark:hover:bg-sky-900/50"
      aria-label={t('weather.openForecast', {
        condition: label,
        temperature: formatWeatherTemperature(summary, { locale }),
        defaultValue: 'Open weather forecast: {{temperature}}, {{condition}}',
      })}
      title={`${formatWeatherTemperature(summary, { locale })} ${label}`}
    >
      <WeatherIcon conditionKey={summary.conditionKey} isDay={summary.isDay} size={13} className="shrink-0" />
      <span className="tabular-nums">{formatWeatherTemperature(summary, { locale })}</span>
      {summary.stale ? (
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />
      ) : null}
    </button>
  );
}
