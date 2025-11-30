const DEFAULT_LEAGUE_GROUP_COLOR = '#4F46E5';

export const getLeagueGroupColor = (color?: string | null) =>
  color && color.trim().length > 0 ? color : DEFAULT_LEAGUE_GROUP_COLOR;

export const getLeagueGroupSoftColor = (color?: string | null, alpha = '20') =>
  `${getLeagueGroupColor(color)}${alpha}`;

