const LEAGUE_GROUP_COLORS = [
  '#4F46E5',
  '#6366F1',
  '#8B5CF6',
  '#EC4899',
  '#F472B6',
  '#0EA5E9',
  '#06B6D4',
  '#14B8A6',
  '#10B981',
  '#84CC16',
  '#F59E0B',
  '#F97316',
];

export const getRandomLeagueGroupColor = () => {
  const randomIndex = Math.floor(Math.random() * LEAGUE_GROUP_COLORS.length);
  return LEAGUE_GROUP_COLORS[randomIndex];
};

export const getLeagueGroupColors = () => [...LEAGUE_GROUP_COLORS];

export const getDistinctLeagueGroupColor = (usedColors: string[] = []) => {
  const remainingColors = LEAGUE_GROUP_COLORS.filter(
    (color) => !usedColors.includes(color),
  );
  const pool = remainingColors.length ? remainingColors : LEAGUE_GROUP_COLORS;
  const randomIndex = Math.floor(Math.random() * pool.length);
  return pool[randomIndex];
};

