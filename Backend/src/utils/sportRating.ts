import type { Sport } from '../sport/sportIds';
import { getSportConfig } from '../sport/sportRegistry';
import type { SportRatingDisplaySystem } from '../shared/createTemplates';

function linearMapLevel(level: number, outMin: number, outMax: number): number {
  const t = (Math.max(1, Math.min(7, level)) - 1) / 6;
  return outMin + t * (outMax - outMin);
}

function mapLevelToExternalValue(system: SportRatingDisplaySystem, level: number): string | null {
  switch (system) {
    case 'PLAYTOMIC':
      return linearMapLevel(level, 1, 7).toFixed(1);
    case 'NTRP':
      return (Math.round(linearMapLevel(level, 1.5, 5.5) * 2) / 2).toFixed(1);
    case 'DUPR':
      return linearMapLevel(level, 2, 5.5).toFixed(2);
    case 'UTR':
      return linearMapLevel(level, 1, 12).toFixed(1);
    case 'USATT':
      return String(Math.round(linearMapLevel(level, 800, 2200)));
    case 'SQUASHLEVELS':
      return String(Math.round(linearMapLevel(level, 200, 3000)));
    case 'NONE':
      return null;
    default:
      return null;
  }
}

/** Profile / card display only — not for avatar badges. */
export function formatRatingHint(
  sport: Sport,
  level: number,
  externalHint?: string | null,
): string | null {
  const trimmed = externalHint?.trim();
  if (trimmed) {
    const model = getSportConfig(sport).ratingModel;
    const system = model.display?.system;
    if (system && system !== 'NONE') {
      return `≈ ${trimmed} ${system === 'SQUASHLEVELS' ? 'SquashLevels' : system.charAt(0) + system.slice(1).toLowerCase()}`;
    }
    return trimmed;
  }

  const model = getSportConfig(sport).ratingModel;
  const display = model.display;
  if (!display || display.system === 'NONE') return null;

  if (display.mapLevelToHint) {
    return display.mapLevelToHint(level);
  }

  const value = mapLevelToExternalValue(display.system, level);
  if (!value) return null;

  const label =
    display.system === 'SQUASHLEVELS'
      ? 'SquashLevels'
      : display.system.charAt(0) + display.system.slice(1).toLowerCase();
  return `≈ ${value} ${label}`;
}

export function sportSupportsExternalRatingHint(sport: Sport): boolean {
  const system = getSportConfig(sport).ratingModel.display?.system;
  return system !== undefined && system !== 'NONE';
}

export const EXTERNAL_RATING_HINT_MAX_LENGTH = 32;

export function normalizeExternalRatingHint(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'string') {
    throw new Error('externalRatingHint must be a string or null');
  }
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.length > EXTERNAL_RATING_HINT_MAX_LENGTH) {
    throw new Error(`externalRatingHint must be at most ${EXTERNAL_RATING_HINT_MAX_LENGTH} characters`);
  }
  return trimmed;
}
