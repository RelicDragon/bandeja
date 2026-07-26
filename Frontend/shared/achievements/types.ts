export type TrophyRarity = 'COMMON' | 'RARE' | 'LEGENDARY';

export type TrophyRuleKind =
  | 'PODIUM'
  | 'HABIT_STREAK'
  | 'HABIT_VOLUME'
  | 'HABIT_FIRST_WIN';

export type TrophyArtKey =
  | 'podium_gold'
  | 'podium_silver'
  | 'podium_bronze'
  | 'habit_first_win'
  | 'habit_games_10'
  | 'habit_games_50'
  | 'habit_games_100'
  | 'habit_streak_4'
  | 'habit_streak_8'
  | 'habit_streak_12';

export type AchievementDefinitionId =
  | 'podium_gold'
  | 'podium_silver'
  | 'podium_bronze'
  | 'habit_first_win'
  | 'habit_games_10'
  | 'habit_games_50'
  | 'habit_games_100'
  | 'habit_streak_4'
  | 'habit_streak_8'
  | 'habit_streak_12';

export type AchievementDefinition = {
  id: AchievementDefinitionId;
  rarity: TrophyRarity;
  artKey: TrophyArtKey;
  ruleKind: TrophyRuleKind;
  /** i18n key under trophies.* */
  titleKey: string;
  /** i18n key under trophies.* */
  descriptionKey: string;
  /** Podium place 1–3; habit milestones use threshold. */
  place?: 1 | 2 | 3;
  /** Habit unlock threshold (weeks or games). */
  threshold?: number;
  /** Habit milestones are one-shot; podium stacks per event. */
  multiplicity: 'one_shot' | 'per_event';
};

export type AchievementInstanceInput = {
  id: string;
  definitionId: AchievementDefinitionId;
  earnedAt: string;
  sport?: string | null;
  place?: number | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  sourceGameId?: string | null;
  sourceTitle?: string | null;
};

export type AchievementPinInput = {
  slot: number;
  achievementId: string;
};

export type TrophyProgress = {
  current: number;
  target: number;
};

export type TrophyShowcaseResolvedSlot = {
  slot: number;
  instance: AchievementInstanceInput | null;
  definitionId: AchievementDefinitionId | null;
  pinned: boolean;
};
