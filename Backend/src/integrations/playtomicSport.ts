import { Sport } from '@prisma/client';
import { SPORT_REGISTRY } from '../sport/sportRegistry';

const MIN_BANDEJA_LEVEL = 1.0;
const MAX_BANDEJA_LEVEL = 7.0;

function clampBandejaLevel(level: number): number {
  return Math.max(MIN_BANDEJA_LEVEL, Math.min(MAX_BANDEJA_LEVEL, level));
}

const PLAYTOMIC_TO_SPORT = new Map<string, Sport>();

for (const config of Object.values(SPORT_REGISTRY)) {
  if (config.playtomicSportId) {
    PLAYTOMIC_TO_SPORT.set(config.playtomicSportId.toUpperCase(), config.id);
  }
}

/** Playtomic `sport` / `sport_ids` values we import (registry `playtomicSportId`). */
export const SUPPORTED_PLAYTOMIC_SPORT_IDS: readonly string[] = [...PLAYTOMIC_TO_SPORT.keys()];

export function mapPlaytomicSportToSport(playtomicSportId: string): Sport | null {
  const key = (playtomicSportId || '').trim().toUpperCase();
  if (!key) return null;
  return PLAYTOMIC_TO_SPORT.get(key) ?? null;
}

export function clubHasSupportedPlaytomicSport(sportIds: string[] | undefined): boolean {
  const ids = sportIds ?? [];
  return ids.some((id) => PLAYTOMIC_TO_SPORT.has(id.trim().toUpperCase()));
}

/** Playtomic player level 0.0–7.0 → Bandeja canonical 1.0–7.0. */
export function mapPlaytomicLevelToBandeja(playtomicLevel: number): number {
  if (!Number.isFinite(playtomicLevel)) return MIN_BANDEJA_LEVEL;
  const clamped = Math.max(0, Math.min(7, playtomicLevel));
  if (clamped <= 0) return MIN_BANDEJA_LEVEL;
  return clampBandejaLevel(clamped);
}

export function formatPlaytomicLevelValue(playtomicLevel: number): string {
  return mapPlaytomicLevelToBandeja(playtomicLevel).toFixed(1);
}

export type PlaytomicSportLevelInput = {
  playtomicSportId: string;
  level: number;
  reliability?: number;
};

export type ParsedPlaytomicSportLevel = {
  sport: Sport;
  playtomicLevel: number;
  bandejaLevel: number;
  externalHint: string;
  reliability?: number;
};

export function parsePlaytomicSportLevelRow(
  row: PlaytomicSportLevelInput,
): ParsedPlaytomicSportLevel | null {
  const sport = mapPlaytomicSportToSport(row.playtomicSportId);
  if (!sport || !Number.isFinite(row.level)) return null;
  const playtomicLevel = row.level;
  return {
    sport,
    playtomicLevel,
    bandejaLevel: mapPlaytomicLevelToBandeja(playtomicLevel),
    externalHint: formatPlaytomicLevelValue(playtomicLevel),
    reliability:
      row.reliability !== undefined && Number.isFinite(row.reliability)
        ? Math.max(0, Math.min(100, row.reliability))
        : undefined,
  };
}

export function parsePlaytomicSportLevels(
  levels: PlaytomicSportLevelInput[],
): ParsedPlaytomicSportLevel[] {
  const out: ParsedPlaytomicSportLevel[] = [];
  const seen = new Set<Sport>();
  for (const row of levels) {
    const parsed = parsePlaytomicSportLevelRow(row);
    if (!parsed || seen.has(parsed.sport)) continue;
    seen.add(parsed.sport);
    out.push(parsed);
  }
  return out;
}
