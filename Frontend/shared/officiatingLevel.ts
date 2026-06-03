import { Sports, isSport, type Sport } from './sport';

export type OfficiatingLevel = 'none' | 'hints' | 'strict';

export type PresetTier = 'social' | 'match' | 'both';

const OFFICIATING_LEVELS: ReadonlySet<OfficiatingLevel> = new Set(['none', 'hints', 'strict']);

export function parseOfficiatingLevel(raw: unknown): OfficiatingLevel | undefined {
  if (typeof raw === 'string' && OFFICIATING_LEVELS.has(raw as OfficiatingLevel)) {
    return raw as OfficiatingLevel;
  }
  return undefined;
}

/** Game.metadata.officiatingLevel override (optional). */
export function parseGameOfficiatingLevel(metadata: unknown): OfficiatingLevel | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  return parseOfficiatingLevel((metadata as Record<string, unknown>).officiatingLevel);
}

export function defaultOfficiatingForTier(tier: PresetTier): OfficiatingLevel {
  return tier === 'match' ? 'strict' : 'none';
}

export function officiatingIsStrict(level: OfficiatingLevel): boolean {
  return level === 'strict';
}

export function inferPresetTier(preset: string): PresetTier {
  if (preset.startsWith('POINTS_') || preset === 'TIMED' || preset === 'PAR_11') return 'social';
  if (preset.startsWith('CLASSIC_') || preset.startsWith('BEST_OF_')) return 'match';
  return 'both';
}

export function resolveOfficiatingLevel(input: {
  sport: Sport | string | null | undefined;
  preset: string | null | undefined;
  presetMetaOfficiating?: OfficiatingLevel | null;
  presetMetaTier?: PresetTier | null;
  gameOfficiatingLevel?: OfficiatingLevel | null;
}): OfficiatingLevel {
  if (input.gameOfficiatingLevel) return input.gameOfficiatingLevel;
  if (input.presetMetaOfficiating) return input.presetMetaOfficiating;
  const sport = input.sport && isSport(input.sport) ? input.sport : null;
  const tier =
    input.presetMetaTier ??
    (input.preset ? inferPresetTier(input.preset) : 'both');
  if (sport === Sports.PICKLEBALL && tier === 'social') return 'hints';
  return defaultOfficiatingForTier(tier);
}

/** Honor-system coach buttons (kitchen fault, etc.) — not strict enforcement. */
export function officiatingShowsHonorHints(level: OfficiatingLevel): boolean {
  return level === 'hints';
}
