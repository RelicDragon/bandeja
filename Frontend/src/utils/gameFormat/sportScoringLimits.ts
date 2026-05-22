import type { ScoringMode, ScoringPreset } from '@/types';
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
): boolean {
  if (preset == null || preset === '') return false;
  return config.allowedScoringPresets.includes(preset as ScoringPreset);
}
