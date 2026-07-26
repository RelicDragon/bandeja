import type { TrophyArtKey } from '@shared/achievements';

type TrophyArtProps = {
  artKey: string;
  locked?: boolean;
  className?: string;
};

const ART_SRC: Record<TrophyArtKey, string> = {
  podium_gold: '/trophies/podium_gold.png',
  podium_silver: '/trophies/podium_silver.png',
  podium_bronze: '/trophies/podium_bronze.png',
  habit_first_win: '/trophies/habit_first_win.png',
  habit_games_10: '/trophies/habit_games_10.png',
  habit_games_50: '/trophies/habit_games_50.png',
  habit_games_100: '/trophies/habit_games_100.png',
  habit_streak_4: '/trophies/habit_streak_4.png',
  habit_streak_8: '/trophies/habit_streak_8.png',
  habit_streak_12: '/trophies/habit_streak_12.png',
};

function resolveSrc(artKey: string): { key: string; src: string } {
  if (Object.prototype.hasOwnProperty.call(ART_SRC, artKey)) {
    const key = artKey as TrophyArtKey;
    return { key, src: ART_SRC[key] };
  }
  return { key: 'unknown', src: ART_SRC.podium_silver };
}

export function TrophyArt({ artKey, locked = false, className = '' }: TrophyArtProps) {
  const { key, src } = resolveSrc(artKey);

  return (
    <img
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      data-art-key={key}
      className={`object-contain select-none ${locked ? 'opacity-35 grayscale' : ''} ${className}`}
    />
  );
}
