import { memo, useCallback, useMemo, useState } from 'react';
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
  const [fullDayRequested, setFullDayRequested] = useState(false);
  const weatherCityId = game.city?.id ?? game.club?.cityId ?? game.court?.club?.cityId ?? null;
  const weatherParams = useMemo(
    () => {
      if (!weatherCityId || !game.startTime || !game.endTime) return null;

      return {
        cityId: weatherCityId,
        startTime: game.startTime,
        endTime: game.endTime,
      };
    },
    [game.endTime, game.startTime, weatherCityId],
  );
  const query = useWeatherPreviewQuery(weatherParams ?? EMPTY_WEATHER_PARAMS, open && Boolean(weatherParams));
  const fullDayParams = useMemo(
    () => (weatherParams ? { ...weatherParams, scope: 'day' as const } : EMPTY_WEATHER_PARAMS),
    [weatherParams],
  );
  const fullDayQuery = useWeatherPreviewQuery(
    fullDayParams,
    open && fullDayRequested && Boolean(weatherParams),
  );
  const fullDayForecast = fullDayQuery.data;
  const handleClose = useCallback(() => {
    setFullDayRequested(false);
    onClose();
  }, [onClose]);
  const handleShowFullDay = useCallback(() => setFullDayRequested(true), []);

  return (
    <WeatherWindowDialog
      open={open}
      onClose={handleClose}
      forecast={fullDayForecast ?? query.data}
      isLoading={query.isPending}
      isFullDay={Boolean(fullDayForecast)}
      isFullDayLoading={fullDayRequested && fullDayQuery.isPending}
      onShowFullDay={handleShowFullDay}
      startTime={weatherParams?.startTime ?? game.startTime}
      endTime={weatherParams?.endTime ?? game.endTime}
      locale={locale}
      hour12={hour12}
      modalId={`game-weather-${weatherParams?.cityId ?? game.id}-${weatherParams?.startTime ?? game.startTime}`}
    />
  );
}

export const GameWeatherDialog = memo(GameWeatherDialogInner);
