import type { ScoringMode, ScoringPreset } from '@/types';
import { isPointsPreset, isRallyMatchPreset } from './scoringCompatibility';
import type { UseGameFormatResult } from '@/hooks/useGameFormat';

/** Points target selection is suspended while a POINTS match is timed. */
export function isPointsTargetSuspended(
  scoringMode: ScoringMode,
  matchTimerEnabled: boolean,
): boolean {
  return scoringMode === 'POINTS' && matchTimerEnabled;
}

const CLASSIC_STRUCTURE_PRESETS: ScoringPreset[] = [
  'CLASSIC_BEST_OF_3',
  'CLASSIC_SUPER_TIEBREAK',
  'CLASSIC_BEST_OF_5',
  'CLASSIC_SHORT_SET',
  'CLASSIC_PRO_SET',
  'CLASSIC_SINGLE_SET',
  'CLASSIC_TIMED',
];

export function isSetStructureStepValid(f: UseGameFormatResult): boolean {
  if (f.scoringMode !== 'CLASSIC') return true;
  const structureOk = CLASSIC_STRUCTURE_PRESETS.includes(f.scoringPreset);
  if (f.matchTimerEnabled) {
    return structureOk && f.matchTimedCapMinutes >= 1 && f.matchTimedCapMinutes <= 60;
  }
  return structureOk;
}

export function isPointsTotalStepValid(f: UseGameFormatResult): boolean {
  if (f.scoringMode !== 'POINTS') return true;
  if (f.matchTimerEnabled) {
    // Timed matches end at the buzzer with arbitrary totals, so no points target
    // is required (or allowed) — only the timer duration must be sane.
    return f.matchTimedCapMinutes >= 1 && f.matchTimedCapMinutes <= 60;
  }
  return f.customPointsTotal != null
    ? f.customPointsTotal > 0 && f.customPointsTotal <= 999
    : isPointsPreset(f.scoringPreset) || isRallyMatchPreset(f.scoringPreset);
}
