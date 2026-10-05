import type { TrophyRarity } from '@/types/trophies';
import {
  NOVICE_MAX_RANK,
  featuresUnlockedBetween,
  type NoviceFeature,
} from '@shared/novice';

/** Latest own result, shown on the congrats step when cheaply available. */
export type NoviceCelebrationResult = {
  gameId: string;
  levelBefore: number;
  levelAfter: number;
  wins: number;
  ties: number;
  losses: number;
  isWinner: boolean;
};

/** An achievement unlocked by the game (habit unlock / pending celebration). */
export type NoviceCelebrationAchievement = {
  definitionId: string;
  titleKey: string;
  artKey: string;
  rarity: TrophyRarity;
  achievementId?: string;
};

export type NoviceCelebrationStep =
  | { kind: 'congrats'; gameNumber: number; isFirstGame: boolean; result: NoviceCelebrationResult | null }
  | { kind: 'achievements'; items: NoviceCelebrationAchievement[] }
  | { kind: 'rankUp'; fromRank: number; toRank: number; countedGames: number }
  | { kind: 'features'; features: NoviceFeature[]; isRegular: boolean };

/**
 * Features worth a reveal card. Ads switching back on at Regular is a gating
 * fact, not a reward.
 */
const NOT_CELEBRATED: ReadonlySet<NoviceFeature> = new Set<NoviceFeature>(['ads']);

export const MAX_CELEBRATED_ACHIEVEMENTS = 3;

export function celebratedFeaturesBetween(fromRank: number, toRank: number): NoviceFeature[] {
  return featuresUnlockedBetween(fromRank, toRank).filter((f) => !NOT_CELEBRATED.has(f));
}

/**
 * One combined sequence for everything gained since the last acknowledged
 * rank: congrats → achievement(s) → rank-up (old → highest) → feature reveal.
 */
export function buildNoviceCelebrationPlan(input: {
  fromRank: number;
  toRank: number;
  countedGames: number | null | undefined;
  result?: NoviceCelebrationResult | null;
  achievements?: NoviceCelebrationAchievement[];
}): NoviceCelebrationStep[] {
  const fromRank = Math.max(0, Math.floor(input.fromRank));
  const toRank = Math.min(NOVICE_MAX_RANK, Math.floor(input.toRank));
  if (toRank <= fromRank) return [];

  const counted =
    typeof input.countedGames === 'number' && Number.isFinite(input.countedGames)
      ? Math.max(toRank, Math.floor(input.countedGames))
      : toRank;

  const steps: NoviceCelebrationStep[] = [
    {
      kind: 'congrats',
      gameNumber: counted,
      isFirstGame: counted === 1,
      result: input.result ?? null,
    },
  ];

  const achievements = (input.achievements ?? []).slice(0, MAX_CELEBRATED_ACHIEVEMENTS);
  if (achievements.length > 0) {
    steps.push({ kind: 'achievements', items: achievements });
  }

  steps.push({ kind: 'rankUp', fromRank, toRank, countedGames: counted });

  const isRegular = toRank >= NOVICE_MAX_RANK;
  const features = celebratedFeaturesBetween(fromRank, toRank);
  if (features.length > 0 || isRegular) {
    steps.push({ kind: 'features', features, isRegular });
  }

  return steps;
}
