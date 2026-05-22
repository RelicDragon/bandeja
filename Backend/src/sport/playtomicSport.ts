import { Sport } from '@prisma/client';
import { SPORT_REGISTRY } from './sportRegistry';

const PLAYTOMIC_TO_SPORT = new Map<string, Sport>();

for (const config of Object.values(SPORT_REGISTRY)) {
  if (config.playtomicSportId) {
    PLAYTOMIC_TO_SPORT.set(config.playtomicSportId.toUpperCase(), config.id);
  }
}

/** Playtomic `sport` / `sport_ids` values we import (registry `playtomicSportId`). */
export const SUPPORTED_PLAYTOMIC_SPORT_IDS: readonly string[] = [
  ...PLAYTOMIC_TO_SPORT.keys(),
];

export function mapPlaytomicSportToSport(playtomicSportId: string): Sport | null {
  const key = (playtomicSportId || '').trim().toUpperCase();
  if (!key) return null;
  return PLAYTOMIC_TO_SPORT.get(key) ?? null;
}

export function clubHasSupportedPlaytomicSport(sportIds: string[] | undefined): boolean {
  const ids = sportIds ?? [];
  return ids.some((id) => PLAYTOMIC_TO_SPORT.has(id.trim().toUpperCase()));
}
