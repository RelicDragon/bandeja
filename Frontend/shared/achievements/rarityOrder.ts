import type { TrophyRarity } from './types';

const RARITY_RANK: Record<TrophyRarity, number> = {
  COMMON: 1,
  RARE: 2,
  LEGENDARY: 3,
  UNIQUE: 4,
};

export function rarityRank(rarity: TrophyRarity): number {
  return RARITY_RANK[rarity];
}

/** Higher = rarer. */
export function compareRarityDesc(a: TrophyRarity, b: TrophyRarity): number {
  return rarityRank(b) - rarityRank(a);
}
