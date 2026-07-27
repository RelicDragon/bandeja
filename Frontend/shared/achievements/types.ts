export type TrophyRarity = 'COMMON' | 'RARE' | 'LEGENDARY';

export type TrophyRuleKind =
  | 'PODIUM'
  | 'HABIT_STREAK'
  | 'HABIT_VOLUME'
  | 'HABIT_FIRST_WIN'
  | 'HABIT_WINS'
  | 'HABIT_SPORT_VOLUME'
  | 'HABIT_ORGANIZE_GAME'
  | 'HABIT_ORGANIZE_TOURNAMENT'
  | 'HABIT_ORGANIZE_BAR';

export type TrophyArtKey =
  | 'podium_gold'
  | 'podium_silver'
  | 'podium_bronze'
  | 'habit_first_win'
  | 'habit_first_padel_game'
  | 'habit_games_10'
  | 'habit_games_50'
  | 'habit_games_100'
  | 'habit_games_500'
  | 'habit_games_1000'
  | 'habit_wins_10'
  | 'habit_wins_25'
  | 'habit_wins_50'
  | 'habit_wins_100'
  | 'habit_wins_500'
  | 'habit_streak_4'
  | 'habit_streak_8'
  | 'habit_streak_12'
  | 'habit_streak_16'
  | 'habit_streak_32'
  | 'habit_streak_64'
  | 'habit_org_game_1'
  | 'habit_org_game_10'
  | 'habit_org_game_25'
  | 'habit_org_game_50'
  | 'habit_org_game_100'
  | 'habit_org_game_500'
  | 'habit_org_tournament_1'
  | 'habit_org_tournament_5'
  | 'habit_org_tournament_10'
  | 'habit_org_tournament_25'
  | 'habit_org_tournament_50'
  | 'habit_org_tournament_100'
  | 'habit_org_bar_1'
  | 'habit_org_bar_5'
  | 'habit_org_bar_10'
  | 'habit_org_bar_25'
  | 'habit_org_bar_50'
  | 'habit_org_bar_100';

export type AchievementDefinitionId =
  | 'podium_gold'
  | 'podium_silver'
  | 'podium_bronze'
  | 'habit_first_win'
  | 'habit_first_padel_game'
  | 'habit_games_10'
  | 'habit_games_50'
  | 'habit_games_100'
  | 'habit_games_500'
  | 'habit_games_1000'
  | 'habit_wins_10'
  | 'habit_wins_25'
  | 'habit_wins_50'
  | 'habit_wins_100'
  | 'habit_wins_500'
  | 'habit_streak_4'
  | 'habit_streak_8'
  | 'habit_streak_12'
  | 'habit_streak_16'
  | 'habit_streak_32'
  | 'habit_streak_64'
  | 'habit_org_game_1'
  | 'habit_org_game_10'
  | 'habit_org_game_25'
  | 'habit_org_game_50'
  | 'habit_org_game_100'
  | 'habit_org_game_500'
  | 'habit_org_tournament_1'
  | 'habit_org_tournament_5'
  | 'habit_org_tournament_10'
  | 'habit_org_tournament_25'
  | 'habit_org_tournament_50'
  | 'habit_org_tournament_100'
  | 'habit_org_bar_1'
  | 'habit_org_bar_5'
  | 'habit_org_bar_10'
  | 'habit_org_bar_25'
  | 'habit_org_bar_50'
  | 'habit_org_bar_100';

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
  /** Sport scope for HABIT_SPORT_VOLUME (e.g. PADEL). */
  sport?: string;
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
