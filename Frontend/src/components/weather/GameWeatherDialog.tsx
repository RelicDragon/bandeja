import { memo } from 'react';
import type { Game } from '@/types';
import { WeatherWindowDialog } from './WeatherWindowDialog';

interface GameWeatherDialogProps {
  game: Game;
  open: boolean;
  onClose: () => void;
  locale: string;
  hour12: boolean;
}

function GameWeatherDialogInner({ game, open, onClose, locale, hour12 }: GameWeatherDialogProps) {
  const cityId = game.city.id;

  return (
    <WeatherWindowDialog
      open={open}
      onClose={onClose}
      cityId={cityId}
      cityTimezone={game.city.timezone}
      startTime={game.startTime}
      endTime={game.endTime}
      locale={locale}
      hour12={hour12}
      modalId={`game-weather-${game.id}-${game.startTime}`}
    />
  );
}

export const GameWeatherDialog = memo(GameWeatherDialogInner);
