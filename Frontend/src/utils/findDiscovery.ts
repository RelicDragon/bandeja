import type { Game } from '@/types';
import {
  inferPresetTier,
  isCasualCreateFlowEnabled,
  presetTierMap,
} from '@/sport/createFlow';
import { getSportConfig } from '@/sport/sportRegistry';
import { parseGameSport } from '@/utils/gameSport';

export type FindTierFilter = 'social' | 'match';

export function isFindDiscoveryEnabled(): boolean {
  return isCasualCreateFlowEnabled('GAME');
}

export function resolveGameDiscoveryTier(game: Game): FindTierFilter | null {
  if (game.entityType !== 'GAME') return null;
  const sport = parseGameSport(game.sport);
  const preset = game.scoringPreset;
  if (!preset) return null;

  const tiers = presetTierMap(getSportConfig(sport).presetMeta);
  const tier = tiers.get(preset) ?? inferPresetTier(preset);
  if (tier === 'social') return 'social';
  if (tier === 'match') return 'match';

  if (!game.affectsRating) return 'social';
  if (game.gameType !== 'CLASSIC') return 'social';
  return 'match';
}

export function passesFindTierFilter(game: Game, filterTier: FindTierFilter | undefined): boolean {
  if (!filterTier) return true;
  const tier = resolveGameDiscoveryTier(game);
  if (!tier) return false;
  return tier === filterTier;
}

export function passesFindNoRatingFilter(game: Game, filterNoRating: boolean | undefined): boolean {
  if (!filterNoRating) return true;
  return game.affectsRating === false;
}
