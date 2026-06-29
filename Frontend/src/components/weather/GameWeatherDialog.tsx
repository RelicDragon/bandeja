import { useState } from 'react';
import type { Game } from '@/types';
import { useWeatherPreviewQuery } from '@/queries/weather';
import { resolveGameWeatherQueryParams } from '@/utils/gameWeatherQueryParams';
import { WeatherWindowDialog } from './WeatherWindowDialog';

interface GameWeatherDialogProps {
  game: Game;
  open: boolean;
  onClose: () => void;
  locale: string;
  hour12: boolean;
}

export function GameWeatherDialog({ game, open, onClose, locale, hour12 }: GameWeatherDialogProps) {
  const [fullDayRequested, setFullDayRequested] = useState(false);
  const weatherParams = resolveGameWeatherQueryParams(game);
  const query = useWeatherPreviewQuery(weatherParams ?? {}, open && Boolean(weatherParams));
  const fullDayQuery = useWeatherPreviewQuery(
    weatherParams ? { ...weatherParams, scope: 'day' } : {},
    open && fullDayRequested && Boolean(weatherParams),
  );
  const fullDayForecast = fullDayQuery.data;

  return (
    <WeatherWindowDialog
      open={open}
      onClose={() => {
        setFullDayRequested(false);
        onClose();
      }}
      forecast={fullDayForecast ?? query.data}
      isLoading={query.isPending}
      isFullDay={Boolean(fullDayForecast)}
      isFullDayLoading={fullDayRequested && fullDayQuery.isPending}
      onShowFullDay={() => setFullDayRequested(true)}
      startTime={weatherParams?.startTime ?? game.startTime}
      endTime={weatherParams?.endTime ?? game.endTime}
      locale={locale}
      hour12={hour12}
      modalId={`game-weather-${weatherParams?.cityId ?? game.id}-${weatherParams?.startTime ?? game.startTime}`}
    />
  );
}
