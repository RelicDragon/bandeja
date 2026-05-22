import { useEffect, useMemo } from 'react';
import { useSportConfig } from '@/hooks/useSportConfig';
import type { Sport } from '@/sport/sportRegistry';
import type { UseGameFormatResult } from '@/hooks/useGameFormat';
import {
  allowedScoringModesFromPresets,
  defaultScoringModeForSport,
  isScoringPresetAllowedForSport,
} from '@/utils/gameFormat/sportScoringLimits';

export function useSportGameFormatLimits(sport: Sport | string | null | undefined) {
  const sportConfig = useSportConfig(sport);

  const allowedScoringModes = useMemo(
    () => allowedScoringModesFromPresets(sportConfig.allowedScoringPresets),
    [sportConfig.allowedScoringPresets],
  );

  const defaultScoringMode = useMemo(
    () => defaultScoringModeForSport(sportConfig),
    [sportConfig],
  );

  return {
    sportConfig,
    allowedScoringModes,
    allowedScoringPresets: sportConfig.allowedScoringPresets,
    defaultScoringMode,
    defaultScoringPreset: sportConfig.defaultScoringPreset,
  };
}

/** Keep wizard state within sport registry (e.g. no tennis sets for table tennis). */
export function useClampGameFormatToSport(
  sport: Sport | string | null | undefined,
  format: Pick<UseGameFormatResult, 'scoringMode' | 'scoringPreset' | 'setScoringMode' | 'setScoringPreset'>,
  enabled = true,
) {
  const limits = useSportGameFormatLimits(sport);
  const { scoringMode, scoringPreset, setScoringMode, setScoringPreset } = format;

  useEffect(() => {
    if (!enabled) return;
    if (!limits.allowedScoringModes.includes(scoringMode)) {
      setScoringMode(limits.defaultScoringMode);
      return;
    }
    if (!isScoringPresetAllowedForSport(limits.sportConfig, scoringPreset)) {
      setScoringPreset(limits.defaultScoringPreset);
    }
  }, [
    enabled,
    limits.allowedScoringModes,
    limits.defaultScoringMode,
    limits.defaultScoringPreset,
    limits.sportConfig,
    scoringMode,
    scoringPreset,
    setScoringMode,
    setScoringPreset,
  ]);

  return limits;
}
