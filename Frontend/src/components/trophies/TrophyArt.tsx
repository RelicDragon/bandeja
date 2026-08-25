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
  habit_first_padel_game: '/trophies/habit_first_padel_game.png',
  habit_games_10: '/trophies/habit_games_10.png',
  habit_games_50: '/trophies/habit_games_50.png',
  habit_games_100: '/trophies/habit_games_100.png',
  habit_games_500: '/trophies/habit_games_500.png',
  habit_games_1000: '/trophies/habit_games_1000.png',
  habit_wins_10: '/trophies/habit_wins_10.png',
  habit_wins_25: '/trophies/habit_wins_25.png',
  habit_wins_50: '/trophies/habit_wins_50.png',
  habit_wins_100: '/trophies/habit_wins_100.png',
  habit_wins_500: '/trophies/habit_wins_500.png',
  habit_streak_4: '/trophies/habit_streak_4.png',
  habit_streak_8: '/trophies/habit_streak_8.png',
  habit_streak_12: '/trophies/habit_streak_12.png',
  habit_streak_16: '/trophies/habit_streak_16.png',
  habit_streak_32: '/trophies/habit_streak_32.png',
  habit_streak_64: '/trophies/habit_streak_64.png',
  habit_org_game_1: '/trophies/habit_org_game_1.png',
  habit_org_game_10: '/trophies/habit_org_game_10.png',
  habit_org_game_25: '/trophies/habit_org_game_25.png',
  habit_org_game_50: '/trophies/habit_org_game_50.png',
  habit_org_game_100: '/trophies/habit_org_game_100.png',
  habit_org_game_500: '/trophies/habit_org_game_500.png',
  habit_org_tournament_1: '/trophies/habit_org_tournament_1.png',
  habit_org_tournament_5: '/trophies/habit_org_tournament_5.png',
  habit_org_tournament_10: '/trophies/habit_org_tournament_10.png',
  habit_org_tournament_25: '/trophies/habit_org_tournament_25.png',
  habit_org_tournament_50: '/trophies/habit_org_tournament_50.png',
  habit_org_tournament_100: '/trophies/habit_org_tournament_100.png',
  habit_org_bar_1: '/trophies/habit_org_bar_1.png',
  habit_org_bar_5: '/trophies/habit_org_bar_5.png',
  habit_org_bar_10: '/trophies/habit_org_bar_10.png',
  habit_org_bar_25: '/trophies/habit_org_bar_25.png',
  habit_org_bar_50: '/trophies/habit_org_bar_50.png',
  habit_org_bar_100: '/trophies/habit_org_bar_100.png',
  habit_giant_killer_1: '/trophies/habit_giant_killer_1.png',
  habit_giant_killer_5: '/trophies/habit_giant_killer_5.png',
  habit_giant_killer_10: '/trophies/habit_giant_killer_10.png',
  habit_giant_killer_25: '/trophies/habit_giant_killer_25.png',
  habit_giant_killer_50: '/trophies/habit_giant_killer_50.png',
  habit_dynamic_duo_10: '/trophies/habit_dynamic_duo_10.png',
  habit_dynamic_duo_50: '/trophies/habit_dynamic_duo_50.png',
  habit_dynamic_duo_100: '/trophies/habit_dynamic_duo_100.png',
  habit_open_court_10: '/trophies/habit_open_court_10.png',
  habit_open_court_25: '/trophies/habit_open_court_25.png',
  habit_open_court_50: '/trophies/habit_open_court_50.png',
  habit_open_court_100: '/trophies/habit_open_court_100.png',
  habit_open_court_250: '/trophies/habit_open_court_250.png',
  habit_tie_break_1: '/trophies/habit_tie_break_1.png',
  habit_tie_break_5: '/trophies/habit_tie_break_5.png',
  habit_tie_break_12: '/trophies/habit_tie_break_12.png',
  habit_tie_break_32: '/trophies/habit_tie_break_32.png',
  habit_tie_break_64: '/trophies/habit_tie_break_64.png',
  habit_bug_shipped_1: '/trophies/habit_bug_shipped_1.png',
  habit_bug_shipped_5: '/trophies/habit_bug_shipped_5.png',
  habit_bug_shipped_10: '/trophies/habit_bug_shipped_10.png',
  habit_bug_shipped_25: '/trophies/habit_bug_shipped_25.png',
  habit_bug_shipped_50: '/trophies/habit_bug_shipped_50.png',
  leto_2026_participant: '/trophies/leto_2026_participant.png',
  leto_2026_playoffs: '/trophies/leto_2026_playoffs.png',
  leto_2026_place4: '/trophies/leto_2026_place4.png',
  leto_2026_bronze: '/trophies/leto_2026_bronze.png',
  leto_2026_silver: '/trophies/leto_2026_silver.png',
  leto_2026_gold: '/trophies/leto_2026_gold.png',
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
