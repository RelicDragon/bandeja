export type {
  AchievementDefinition,
  AchievementDefinitionId,
  AchievementInstanceInput,
  AchievementPinInput,
  AchievementType,
  TrophyArtKey,
  TrophyProgress,
  TrophyRarity,
  TrophyRuleKind,
  TrophyShowcaseResolvedSlot,
} from './types';

export {
  isLifetimeAchievement,
  isRepeatableAchievement,
} from './mechanics';

export {
  ACHIEVEMENT_CATALOG,
  PODIUM_MIN_PLAYING_PARTICIPANTS,
  getAchievementDefinition,
  isAchievementDefinitionId,
  podiumDefinitionForPlace,
} from './catalog';

export { compareRarityDesc, rarityRank } from './rarityOrder';

export { SHOWCASE_SLOT_COUNT, resolveTrophyShowcase } from './showcaseResolver';

export {
  decidePinSlot,
  isValidShowcaseSlot,
  type PinSlotDecision,
} from './pinSlots';

export {
  habitProgressForDefinition,
  projectTrophyCabinet,
  type CabinetEntry,
  type HabitProgressCounters,
} from './projectCabinet';

export {
  ACHIEVEMENT_LEADERBOARD_FAMILIES,
  achievementLeaderboardFamilyForRuleKind,
  isAchievementLeaderboardFamily,
  type AchievementLeaderboardFamily,
} from './leaderboardFamilies';

export { habitThresholdMet, habitUnlocksDue, habitUnlocksNewlyCrossed } from './habitEligibility';

export {
  filterOrganizeDefinitionsDue,
  gameQualifiesForOrganizeHabit,
  organizeCounterKey,
  organizeRuleKindFor,
  ORGANIZE_BAR_THRESHOLDS,
  ORGANIZE_GAME_THRESHOLDS,
  ORGANIZE_TOURNAMENT_THRESHOLDS,
  type OrganizeHabitKind,
} from './organizeEligibility';

export {
  filterThresholdDefinitionsDue,
  GIANT_KILLER_MIN_LEVEL_GAP,
  GIANT_KILLER_MIN_RELIABILITY,
  GIANT_KILLER_THRESHOLDS,
  DYNAMIC_DUO_THRESHOLDS,
  OPEN_COURT_THRESHOLDS,
  type PartnerHabitRuleKind,
} from './partnerEligibility';

export {
  accumulatePartnerCountersForUser,
  partnerCountersBeforeAfter,
  type PartnerHabitCounters,
  type PartnerPlayerSnap,
  type PartnerScannedMatch,
} from './partnerMatchScan';

export {
  finalistFromChampionshipSides,
  groupUserIdsByPodiumPlace,
  isPodiumEligibleEntityType,
  isPodiumPlace,
  meetsPodiumParticipantFloor,
  mergeTreePodiumsIntoEventPlaces,
  podiumDefinitionForPodiumPlace,
  treeKeysForBracketPodium,
  usesBracketPlacesForEventPodium,
  type PodiumPlace,
  type TreeBracketPodiumIds,
} from './podiumEligibility';
