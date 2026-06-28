import { useState } from 'react';
import type { Game } from '@/types';
import { useGameWeatherQuery } from '@/queries/weather';
import { WeatherWindowDialog } from './WeatherWindowDialog';

interface GameWeatherDialogProps {
  game: Game;
  open: boolean;
  onClose: () => void;
  locale: string;
  hour12: boolean;
}

export function GameWeatherDialog({ game, open, onClose, locale, hour12 }: GameWeatherDialogProps) {
  const query = useGameWeatherQuery(game.id, open);
  const [fullDayRequested, setFullDayRequested] = useState(false);
  const fullDayQuery = useGameWeatherQuery(game.id, open && fullDayRequested, 'day');
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
      startTime={game.startTime}
      endTime={game.endTime}
      locale={locale}
      hour12={hour12}
      modalId={`game-weather-${game.id}`}
    />
  );
}
