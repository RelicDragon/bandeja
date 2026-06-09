import { GameSportTagRow } from '@/components/GameSportTag';
import { useGameDetailsChromeStore } from '@/components/GameDetails/gameDetailsChromeStore';

export const GameDetailsHeader = () => {
  const sportTag = useGameDetailsChromeStore((s) => s.gameDetailsSportTag);
  if (!sportTag) return null;

  return (
    <GameSportTagRow
      sport={sportTag.sport}
      showSport={sportTag.showSport}
      playersPerMatch={sportTag.playersPerMatch}
      showMatchFormat={sportTag.showMatchFormat}
      className="mb-0 min-w-0"
    />
  );
};
