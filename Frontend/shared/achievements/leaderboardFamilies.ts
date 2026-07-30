import type { TrophyRuleKind } from './types';

/**
 * Achievement families shown by both the trophy cabinet and the achievement
 * leaderboard. First-win and sport-debut definitions intentionally roll into
 * their broader Wins and Games families, matching the cabinet carousel.
 */
export const ACHIEVEMENT_LEADERBOARD_FAMILIES = [
  'HABIT_VOLUME',
  'HABIT_WINS',
  'HABIT_STREAK',
  'PODIUM',
  'HABIT_ORGANIZE_GAME',
  'HABIT_ORGANIZE_TOURNAMENT',
  'HABIT_ORGANIZE_BAR',
  'HABIT_GIANT_KILLER',
  'HABIT_DYNAMIC_DUO',
  'HABIT_OPEN_COURT',
] as const;

export type AchievementLeaderboardFamily =
  (typeof ACHIEVEMENT_LEADERBOARD_FAMILIES)[number];

const ACHIEVEMENT_LEADERBOARD_FAMILY_SET = new Set<string>(
  ACHIEVEMENT_LEADERBOARD_FAMILIES,
);

export function achievementLeaderboardFamilyForRuleKind(
  ruleKind: TrophyRuleKind | string,
): AchievementLeaderboardFamily | null {
  if (ruleKind === 'HABIT_FIRST_WIN') return 'HABIT_WINS';
  if (ruleKind === 'HABIT_SPORT_VOLUME') return 'HABIT_VOLUME';
  return isAchievementLeaderboardFamily(ruleKind) ? ruleKind : null;
}

export function isAchievementLeaderboardFamily(
  value: unknown,
): value is AchievementLeaderboardFamily {
  return typeof value === 'string' && ACHIEVEMENT_LEADERBOARD_FAMILY_SET.has(value);
}
