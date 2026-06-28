import { useTranslation } from 'react-i18next';
import type { EntityType, WeatherSummary } from '@/types';
import { getGameCardReactionTheme } from '@/utils/gameCardEntityTheme';
import { formatWeatherTemperature, getWeatherConditionLabel, getWeatherTemperatureColor } from '@/utils/weather';
import { WeatherIcon } from '@/components/weather/WeatherIcon';

interface GameCardWeatherTagProps {
  entityType: EntityType;
  summary: WeatherSummary;
  locale: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/**
 * Weather tag rendered as an entity-tinted pill that visually mirrors the
 * emoji reaction strip (same panel theme + height) so the two read as siblings
 * in the GameCard's top-right cluster.
 */
export function GameCardWeatherTag({ entityType, summary, locale, onClick }: GameCardWeatherTagProps) {
  const { t } = useTranslation();
  const theme = getGameCardReactionTheme(entityType);
  const tempLabel = formatWeatherTemperature(summary, { locale });
  const temperatureColor = getWeatherTemperatureColor(summary);
  const conditionLabel = getWeatherConditionLabel(t, summary.conditionKey);

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className={`flex items-center gap-1 rounded-lg pl-1 pr-1.5 py-0 min-h-[28px] pointer-events-auto ${theme.panel} ${theme.actionHover} transition-colors duration-200`}
      aria-label={t('weather.openForecast', {
        condition: conditionLabel,
        temperature: tempLabel,
        defaultValue: 'Open weather forecast: {{temperature}}, {{condition}}',
      })}
      title={`${tempLabel} ${conditionLabel}`.trim()}
    >
      <WeatherIcon
        conditionKey={summary.conditionKey}
        isDay={summary.isDay}
        size={14}
        className="shrink-0"
      />
      <span
        className="text-[11px] font-semibold tabular-nums leading-none"
        style={{ color: temperatureColor.textColor }}
      >
        {tempLabel}
      </span>
      {summary.stale ? (
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />
      ) : null}
    </button>
  );
}
