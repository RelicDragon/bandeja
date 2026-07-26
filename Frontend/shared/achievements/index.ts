export type {
  AchievementDefinition,
  AchievementDefinitionId,
  AchievementInstanceInput,
  AchievementPinInput,
  TrophyArtKey,
  TrophyProgress,
  TrophyRarity,
  TrophyRuleKind,
  TrophyShowcaseResolvedSlot,
} from './types';

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

export { habitThresholdMet, habitUnlocksDue, habitUnlocksNewlyCrossed } from './habitEligibility';

export {
  groupUserIdsByPodiumPlace,
  isPodiumEligibleEntityType,
  isPodiumPlace,
  meetsPodiumParticipantFloor,
  podiumDefinitionForPodiumPlace,
  usesBracketPlacesForEventPodium,
  type PodiumPlace,
} from './podiumEligibility';
