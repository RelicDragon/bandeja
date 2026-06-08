import type { Sport } from '@shared/sport';

export interface ResolveLevelSportInput {
  explicit?: Sport;
  fromUrl?: Sport;
  fromContext?: Sport;
  viewerDefault?: Sport;
}

/** Prefer explicit param → URL ?sport → SportLevelContext → viewer default sport. */
export function resolveLevelSport(input: ResolveLevelSportInput): Sport | undefined {
  return input.explicit ?? input.fromUrl ?? input.fromContext ?? input.viewerDefault;
}
