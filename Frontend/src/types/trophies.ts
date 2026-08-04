import type { AchievementType } from '@shared/achievements';

export type TrophyRarity = 'COMMON' | 'RARE' | 'LEGENDARY' | 'UNIQUE';
export type { AchievementType };

export type TrophyDefinitionView = {
  id: string;
  type: AchievementType;
  rarity: TrophyRarity;
  artKey: string;
  ruleKind: string;
  titleKey: string;
  descriptionKey: string;
  place?: number;
  threshold?: number;
};

export type TrophyInstanceView = {
  id: string;
  definitionId: string;
  earnedAt: string;
  sport: string | null;
  place: number | null;
  source: {
    entityType: string;
    entityId: string;
    gameId: string | null;
    title: string | null;
  } | null;
};

export type TrophyCabinetEntryView = {
  definition: TrophyDefinitionView;
  unlocked: boolean;
  instances: TrophyInstanceView[];
  progress: { current: number; target: number } | null;
};

export type TrophyShowcaseSlotView = {
  slot: number;
  pinned: boolean;
  definition: TrophyDefinitionView | null;
  instance: TrophyInstanceView | null;
};

export type TrophyPendingCelebration = {
  definitionId: string;
  rarity: TrophyRarity;
  artKey: string;
  titleKey: string;
  achievementId: string;
  place: number | null;
  sport: string | null;
  earnedAt: string;
};

export type TrophiesPayload = {
  showcase: TrophyShowcaseSlotView[];
  cabinet: TrophyCabinetEntryView[];
  pinsEditable: boolean;
  pinnedInstanceIds?: string[];
  unlockedCount: number;
  pendingCelebrations?: TrophyPendingCelebration[];
};

export function emptyTrophiesPayload(isOwner = false): TrophiesPayload {
  return {
    showcase: [
      { slot: 0, pinned: false, definition: null, instance: null },
      { slot: 1, pinned: false, definition: null, instance: null },
      { slot: 2, pinned: false, definition: null, instance: null },
    ],
    cabinet: [],
    pinsEditable: isOwner,
    pinnedInstanceIds: [],
    unlockedCount: 0,
    pendingCelebrations: [],
  };
}
