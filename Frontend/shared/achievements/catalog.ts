import type { AchievementDefinition, AchievementDefinitionId } from './types';

export const PODIUM_MIN_PLAYING_PARTICIPANTS = 8;

export const ACHIEVEMENT_CATALOG: readonly AchievementDefinition[] = [
  {
    id: 'podium_gold',
    rarity: 'LEGENDARY',
    artKey: 'podium_gold',
    ruleKind: 'PODIUM',
    titleKey: 'trophies.defs.podiumGold.title',
    descriptionKey: 'trophies.defs.podiumGold.description',
    place: 1,
    multiplicity: 'per_event',
  },
  {
    id: 'podium_silver',
    rarity: 'RARE',
    artKey: 'podium_silver',
    ruleKind: 'PODIUM',
    titleKey: 'trophies.defs.podiumSilver.title',
    descriptionKey: 'trophies.defs.podiumSilver.description',
    place: 2,
    multiplicity: 'per_event',
  },
  {
    id: 'podium_bronze',
    rarity: 'RARE',
    artKey: 'podium_bronze',
    ruleKind: 'PODIUM',
    titleKey: 'trophies.defs.podiumBronze.title',
    descriptionKey: 'trophies.defs.podiumBronze.description',
    place: 3,
    multiplicity: 'per_event',
  },
  {
    id: 'habit_first_win',
    rarity: 'COMMON',
    artKey: 'habit_first_win',
    ruleKind: 'HABIT_FIRST_WIN',
    titleKey: 'trophies.defs.firstWin.title',
    descriptionKey: 'trophies.defs.firstWin.description',
    threshold: 1,
    multiplicity: 'one_shot',
  },
  {
    id: 'habit_games_10',
    rarity: 'COMMON',
    artKey: 'habit_games_10',
    ruleKind: 'HABIT_VOLUME',
    titleKey: 'trophies.defs.games10.title',
    descriptionKey: 'trophies.defs.games10.description',
    threshold: 10,
    multiplicity: 'one_shot',
  },
  {
    id: 'habit_games_50',
    rarity: 'COMMON',
    artKey: 'habit_games_50',
    ruleKind: 'HABIT_VOLUME',
    titleKey: 'trophies.defs.games50.title',
    descriptionKey: 'trophies.defs.games50.description',
    threshold: 50,
    multiplicity: 'one_shot',
  },
  {
    id: 'habit_games_100',
    rarity: 'COMMON',
    artKey: 'habit_games_100',
    ruleKind: 'HABIT_VOLUME',
    titleKey: 'trophies.defs.games100.title',
    descriptionKey: 'trophies.defs.games100.description',
    threshold: 100,
    multiplicity: 'one_shot',
  },
  {
    id: 'habit_streak_4',
    rarity: 'COMMON',
    artKey: 'habit_streak_4',
    ruleKind: 'HABIT_STREAK',
    titleKey: 'trophies.defs.streak4.title',
    descriptionKey: 'trophies.defs.streak4.description',
    threshold: 4,
    multiplicity: 'one_shot',
  },
  {
    id: 'habit_streak_8',
    rarity: 'RARE',
    artKey: 'habit_streak_8',
    ruleKind: 'HABIT_STREAK',
    titleKey: 'trophies.defs.streak8.title',
    descriptionKey: 'trophies.defs.streak8.description',
    threshold: 8,
    multiplicity: 'one_shot',
  },
  {
    id: 'habit_streak_12',
    rarity: 'RARE',
    artKey: 'habit_streak_12',
    ruleKind: 'HABIT_STREAK',
    titleKey: 'trophies.defs.streak12.title',
    descriptionKey: 'trophies.defs.streak12.description',
    threshold: 12,
    multiplicity: 'one_shot',
  },
] as const;

const BY_ID = new Map<AchievementDefinitionId, AchievementDefinition>(
  ACHIEVEMENT_CATALOG.map((d) => [d.id, d]),
);

export function getAchievementDefinition(
  id: string,
): AchievementDefinition | undefined {
  return BY_ID.get(id as AchievementDefinitionId);
}

export function isAchievementDefinitionId(id: string): id is AchievementDefinitionId {
  return BY_ID.has(id as AchievementDefinitionId);
}

export function podiumDefinitionForPlace(
  place: 1 | 2 | 3,
): AchievementDefinition {
  const found = ACHIEVEMENT_CATALOG.find((d) => d.ruleKind === 'PODIUM' && d.place === place);
  if (!found) throw new Error(`Missing podium definition for place ${place}`);
  return found;
}
