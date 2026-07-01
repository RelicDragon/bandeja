import { memo, useMemo } from 'react';
import type { Game } from '@/types';
import { useWeatherPreviewQuery } from '@/queries/weather';
import { WeatherWindowDialog } from './WeatherWindowDialog';

interface GameWeatherDialogProps {
  game: Game;
  open: boolean;
  onClose: () => void;
  locale: string;
  hour12: boolean;
}

const EMPTY_WEATHER_PARAMS = {};

function GameWeatherDialogInner({ game, open, onClose, locale, hour12 }: GameWeatherDialogProps) {
  const weatherCityId = game.city?.id ?? game.club?.cityId ?? game.court?.club?.cityId ?? null;
  const weatherParams = useMemo(
    () => {
      if (!weatherCityId || !game.startTime || !game.endTime) return null;

      return {
        cityId: weatherCityId,
        startTime: game.startTime,
        endTime: game.endTime,
        scope: 'forecast' as const,
      };
    },
    [game.endTime, game.startTime, weatherCityId],
  );
  const query = useWeatherPreviewQuery(weatherParams ?? EMPTY_WEATHER_PARAMS, open && Boolean(weatherParams));

  return (
    <WeatherWindowDialog
      open={open}
      onClose={onClose}
      forecast={query.data}
      isLoading={query.isPending}
      startTime={weatherParams?.startTime ?? game.startTime}
      endTime={weatherParams?.endTime ?? game.endTime}
      locale={locale}
      hour12={hour12}
      modalId={`game-weather-${weatherParams?.cityId ?? game.id}-${weatherParams?.startTime ?? game.startTime}`}
    />
  );
}

export const GameWeatherDialog = memo(GameWeatherDialogInner);
