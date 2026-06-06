import type { ScoringMode, ScoringPreset } from '@/types';
import type { Sport } from '@shared/sport';
import { isPresetLegal } from '@shared/isPresetLegal';
import type { SportConfig } from '@/sport/sportRegistry';
import { scoringModeFromPreset } from './scoringCompatibility';

export function allowedScoringModesFromPresets(presets: ScoringPreset[]): ScoringMode[] {
  const modes = new Set<ScoringMode>();
  for (const preset of presets) {
    modes.add(scoringModeFromPreset(preset));
  }
  return Array.from(modes);
}

export function defaultScoringModeForSport(config: SportConfig): ScoringMode {
  const fromDefault = scoringModeFromPreset(config.defaultScoringPreset);
  const allowed = allowedScoringModesFromPresets(config.allowedScoringPresets);
  if (allowed.includes(fromDefault)) return fromDefault;
  return allowed[0] ?? 'CLASSIC';
}

export function isScoringPresetAllowedForSport(
  config: SportConfig,
  preset: ScoringPreset | string | null | undefined,
  options?: {
    gameType?: string | null;
    matchGenerationType?: string | null;
    scoringMode?: ScoringMode | null;
  },
): boolean {
  if (preset == null || preset === '') return false;
  return isPresetLegal({
    sport: config.id,
    preset,
    allowedScoringPresets: config.allowedScoringPresets,
    gameType: options?.gameType,
    matchGenerationType: options?.matchGenerationType,
    scoringMode: options?.scoringMode,
  });
}

export function listSportLegalPresets(
  sport: Sport,
  config: SportConfig,
  options?: {
    gameType?: string | null;
    matchGenerationType?: string | null;
    scoringMode?: ScoringMode | null;
    createIntent?: 'social' | 'match' | 'advanced' | null;
  },
): ScoringPreset[] {
  return config.allowedScoringPresets.filter((preset) =>
    isPresetLegal({
      sport,
      preset,
      allowedScoringPresets: config.allowedScoringPresets,
      gameType: options?.gameType,
      matchGenerationType: options?.matchGenerationType,
      scoringMode: options?.scoringMode,
      createIntent: options?.createIntent,
      presetMeta: config.presetMeta,
    }),
  );
}
