import type { TFunction } from 'i18next';
import type { Sport, SportLevelSource, UserSportProfile } from '@/types';
import {
  getSportRatingModel,
  type SportRatingDisplaySystem,
  type SportRatingModel,
} from '@/sport/sportRatingModels';

export type LevelBand = SportRatingModel['levelBands'][number];

export function findLevelBandForLevel(sport: Sport, level: number): LevelBand | undefined {
  const bands = getSportRatingModel(sport).levelBands;
  const clamped = Math.max(1, Math.min(7, level));
  return (
    bands.find((b) => clamped >= b.min && clamped < b.max) ??
    bands.find((b) => clamped >= b.min && clamped <= b.max)
  );
}

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

/** Profile / player card only — not for avatar badges. */
export function formatRatingHint(
  sport: Sport,
  level: number,
  t: TFunction,
  externalHint?: string | null,
): string | null {
  const trimmed = externalHint?.trim();
  if (trimmed) {
    const model = getSportRatingModel(sport);
    const system = model.display?.system;
    if (system && system !== 'NONE') {
      const systemKey = system.toLowerCase();
      return t(`sportRating.display.${systemKey}`, {
        value: trimmed,
        defaultValue: `≈ ${trimmed} ${system}`,
      });
    }
    return trimmed;
  }

  const model = getSportRatingModel(sport);
  const display = model.display;
  if (!display || display.system === 'NONE') return null;

  if (display.mapLevelToHint) {
    return display.mapLevelToHint(level);
  }

  const value = mapLevelToExternalValue(display.system, level);
  if (!value) return null;

  const systemKey = display.system.toLowerCase();
  return t(`sportRating.display.${systemKey}`, { value, defaultValue: `≈ ${value} ${display.system}` });
}

export function formatLevelBandLabel(sport: Sport, level: number, t: TFunction): string | null {
  const band = findLevelBandForLevel(sport, level);
  if (!band) return null;
  return t(band.labelKey);
}

export function formatLevelBandHint(sport: Sport, level: number, t: TFunction): string | null {
  const band = findLevelBandForLevel(sport, level);
  if (band?.hintKey) return t(band.hintKey);
  const sportKey = SPORT_RATING_I18N_NS[sport];
  if (!sportKey) return null;
  const ctxKey = `sportRating.${sportKey}.bandHint`;
  const ctx = t(ctxKey);
  return ctx === ctxKey ? null : ctx;
}

const SPORT_RATING_I18N_NS: Partial<Record<Sport, string>> = {
  TENNIS: 'tennis',
  PICKLEBALL: 'pickleball',
  BADMINTON: 'badminton',
  TABLE_TENNIS: 'tableTennis',
  SQUASH: 'squash',
};

export function formatLevelSourceLabel(
  levelSource: SportLevelSource | undefined,
  t: TFunction,
): string | null {
  if (!levelSource) return null;
  const key = `profile.sports.levelSource.${levelSource.toLowerCase()}`;
  const label = t(key);
  return label === key ? null : label;
}

export function resolveProfileLevelSource(
  profile: UserSportProfile | undefined,
): SportLevelSource | undefined {
  return profile?.levelSource;
}
