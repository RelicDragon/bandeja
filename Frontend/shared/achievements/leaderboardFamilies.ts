import type { TrophyRuleKind } from './types';

/**
 * Achievement leaderboard families. First-win and sport-debut definitions roll
 * into the broader Wins and Games rankings even though UNIQUE cabinet entries
 * are displayed as standalone cards.
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
  'HABIT_TIE_BREAK',
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
