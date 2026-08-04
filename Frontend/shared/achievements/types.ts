export type TrophyRarity = 'COMMON' | 'RARE' | 'LEGENDARY' | 'UNIQUE';

/**
 * Award and cabinet mechanics for a catalog definition.
 * - UNIQUE: earned at most once in a user's lifetime and shown on its own.
 * - MILESTONE: earned at most once, but grouped with its progression family.
 * - REPEATABLE: earned once per source event and shown on its own with a count.
 */
export type AchievementType = 'UNIQUE' | 'MILESTONE' | 'REPEATABLE';

export type TrophyRuleKind =
  | 'PODIUM'
  | 'HABIT_STREAK'
  | 'HABIT_VOLUME'
  | 'HABIT_FIRST_WIN'
  | 'HABIT_WINS'
  | 'HABIT_SPORT_VOLUME'
  | 'HABIT_ORGANIZE_GAME'
  | 'HABIT_ORGANIZE_TOURNAMENT'
  | 'HABIT_ORGANIZE_BAR'
  | 'HABIT_GIANT_KILLER'
  | 'HABIT_DYNAMIC_DUO'
  | 'HABIT_OPEN_COURT'
  /** One-off league-season event medals (e.g. Fix Liga Leto 2026). */
  | 'EVENT_SEASON';

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
  | 'habit_org_bar_100'
  | 'habit_giant_killer_1'
  | 'habit_giant_killer_5'
  | 'habit_giant_killer_10'
  | 'habit_giant_killer_25'
  | 'habit_giant_killer_50'
  | 'habit_dynamic_duo_10'
  | 'habit_dynamic_duo_50'
  | 'habit_dynamic_duo_100'
  | 'habit_open_court_10'
  | 'habit_open_court_25'
  | 'habit_open_court_50'
  | 'habit_open_court_100'
  | 'habit_open_court_250'
  | 'leto_2026_participant'
  | 'leto_2026_playoffs'
  | 'leto_2026_place4'
  | 'leto_2026_bronze'
  | 'leto_2026_silver'
  | 'leto_2026_gold';

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
  | 'habit_org_bar_100'
  | 'habit_giant_killer_1'
  | 'habit_giant_killer_5'
  | 'habit_giant_killer_10'
  | 'habit_giant_killer_25'
  | 'habit_giant_killer_50'
  | 'habit_dynamic_duo_10'
  | 'habit_dynamic_duo_50'
  | 'habit_dynamic_duo_100'
  | 'habit_open_court_10'
  | 'habit_open_court_25'
  | 'habit_open_court_50'
  | 'habit_open_court_100'
  | 'habit_open_court_250'
  | 'leto_2026_participant'
  | 'leto_2026_playoffs'
  | 'leto_2026_place4'
  | 'leto_2026_bronze'
  | 'leto_2026_silver'
  | 'leto_2026_gold';

export type AchievementDefinition = {
  id: AchievementDefinitionId;
  type: AchievementType;
  rarity: TrophyRarity;
  artKey: TrophyArtKey;
  ruleKind: TrophyRuleKind;
  /** i18n key under trophies.* */
  titleKey: string;
  /** i18n key under trophies.* */
  descriptionKey: string;
  /** Podium place 1–3; habit milestones use threshold. */
  place?: 1 | 2 | 3 | 4;
  /** Habit unlock threshold (weeks or games). */
  threshold?: number;
  /** Sport scope for HABIT_SPORT_VOLUME (e.g. PADEL). */
  sport?: string;
  /** Fixed source event (e.g. LEAGUE_SEASON game id) for EVENT_SEASON medals. */
  eventGameId?: string;
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
