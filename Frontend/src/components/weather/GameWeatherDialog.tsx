import { memo } from 'react';
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

function GameWeatherDialogInner({ game, open, onClose, locale, hour12 }: GameWeatherDialogProps) {
  const query = useGameWeatherQuery(game.id, open && Boolean(game.id), 'forecast');

  return (
    <WeatherWindowDialog
      open={open}
      onClose={onClose}
      forecast={query.data}
      isLoading={query.isPending}
      startTime={game.startTime}
      endTime={game.endTime}
      locale={locale}
      hour12={hour12}
      modalId={`game-weather-${game.id}-${game.startTime}`}
    />
  );
}

export const GameWeatherDialog = memo(GameWeatherDialogInner);
