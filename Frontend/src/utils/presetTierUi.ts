import type { TFunction } from 'i18next';
import type { ScoringPreset } from '@/types';
import type { PresetTier } from '@/sport/createFlow';
import { getSportConfig } from '@/sport/sportRegistry';
import { presetTierMap } from '@/sport/createFlow';
import { parseGameSport } from '@/utils/gameSport';
import type { Sport } from '@shared/sport';

export function resolvePresetTierForSport(
  sport: Sport | string | null | undefined,
  preset: ScoringPreset,
): PresetTier | null {
  if (!sport) return null;
  const parsed = typeof sport === 'string' ? parseGameSport(sport) : sport;
  const tiers = presetTierMap(getSportConfig(parsed).presetMeta);
  return tiers.get(preset) ?? null;
}

export function presetTierBadgeLabel(tier: PresetTier, t: TFunction): string | null {
  if (tier === 'social') return t('createGame.presetTier.social');
  if (tier === 'match') return t('createGame.presetTier.match');
  return null;
}

export function presetTierBadgeClass(tier: PresetTier): string {
  if (tier === 'social') {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
  }
  if (tier === 'match') {
    return 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200';
  }
  return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
}
