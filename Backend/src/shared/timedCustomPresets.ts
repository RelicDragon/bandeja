import { Sports, type Sport } from './sport';

/** Open-ended scoring presets (weak live invariants until timer freeze / product rules). */
export const OPEN_ENDED_SCORING_PRESETS = ['TIMED', 'CUSTOM'] as const;
export type OpenEndedScoringPreset = (typeof OPEN_ENDED_SCORING_PRESETS)[number];

export function isOpenEndedScoringPreset(preset: string | null | undefined): preset is OpenEndedScoringPreset {
  return preset === 'TIMED' || preset === 'CUSTOM';
}

/** Create-time allowlist — must match `allowedScoringPresets` in BE/FE sportRegistry. */
export const TIMED_CUSTOM_CREATE_BY_SPORT: Record<Sport, { timed: boolean; custom: boolean }> = {
  [Sports.PADEL]: { timed: true, custom: true },
  [Sports.TENNIS]: { timed: true, custom: true },
  [Sports.PICKLEBALL]: { timed: false, custom: true },
  [Sports.BADMINTON]: { timed: false, custom: true },
  [Sports.TABLE_TENNIS]: { timed: false, custom: true },
  [Sports.SQUASH]: { timed: false, custom: true },
};

/** Allowed on create but live scoring is best-effort (timer freeze UX; no full cap parity). */
export const TIMED_CUSTOM_WEAK_LIVE_SPORTS: ReadonlySet<Sport> = new Set([Sports.PICKLEBALL]);

export function timedCustomCreateAllowed(sport: Sport, preset: string): boolean {
  const policy = TIMED_CUSTOM_CREATE_BY_SPORT[sport];
  if (preset === 'TIMED') return policy.timed;
  if (preset === 'CUSTOM') return policy.custom;
  return true;
}

export function isWeakTimedCustomLive(sport: Sport, preset: string | null | undefined): boolean {
  return TIMED_CUSTOM_WEAK_LIVE_SPORTS.has(sport) && isOpenEndedScoringPreset(preset);
}

/** Points/rally mode: no fixed cap — freeze at partial score when match timer stops. */
export function supportsTimedOpenEndedRallyFreeze(
  preset: string | null | undefined,
  totalPointsPerSet: number,
): boolean {
  return isOpenEndedScoringPreset(preset) && totalPointsPerSet <= 0;
}

export function registryAllowsOpenEndedPreset(
  allowedScoringPresets: readonly string[],
  sport: Sport,
): boolean {
  const policy = TIMED_CUSTOM_CREATE_BY_SPORT[sport];
  if (policy.timed && !allowedScoringPresets.includes('TIMED')) return false;
  if (policy.custom && !allowedScoringPresets.includes('CUSTOM')) return false;
  if (!policy.timed && allowedScoringPresets.includes('TIMED')) return false;
  if (!policy.custom && allowedScoringPresets.includes('CUSTOM')) return false;
  return true;
}
