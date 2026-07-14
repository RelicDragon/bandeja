import type { GameFilters } from '@/utils/gameFiltersStorage';

/** API params for Find structural SQL filters (must match filter hash). */
export type FindStructuralApiParams = {
  clubIds?: string;
  entityTypes?: string;
  hideBar?: boolean;
  levelMin?: number;
  levelMax?: number;
  availableSlots?: boolean;
  mode?: 'calendar' | 'upcoming';
};

const LEVEL_EPS = 1e-6;

export function resolveFindEntityTypesParam(filters: {
  gameFilter?: boolean;
  trainingFilter?: boolean;
  tournamentFilter?: boolean;
  leaguesFilter?: boolean;
}): string | undefined {
  if (filters.gameFilter) return 'GAME';
  if (filters.trainingFilter) return 'TRAINING';
  if (filters.tournamentFilter) return 'TOURNAMENT';
  if (filters.leaguesFilter) return 'LEAGUE';
  return undefined;
}

/**
 * Map Find UI filters → API structural query params.
 * Client FindFilter still applies viewer heuristics + time-of-day panel.
 */
export function buildFindStructuralApiParams(
  filters: Pick<
    GameFilters,
    | 'filterClubIds'
    | 'filterLevelMin'
    | 'filterLevelMax'
    | 'hideBarGames'
    | 'filterAvailableSlots'
    | 'gameFilter'
    | 'trainingFilter'
    | 'tournamentFilter'
    | 'leaguesFilter'
  >,
  mode: 'calendar' | 'upcoming',
): FindStructuralApiParams {
  const params: FindStructuralApiParams = { mode };
  if (filters.filterClubIds?.length) {
    params.clubIds = filters.filterClubIds.join(',');
  }
  const entityTypes = resolveFindEntityTypesParam(filters);
  if (entityTypes) params.entityTypes = entityTypes;
  if (filters.hideBarGames) params.hideBar = true;
  if (filters.filterAvailableSlots) params.availableSlots = true;

  const levelMin = filters.filterLevelMin ?? 1;
  const levelMax = filters.filterLevelMax ?? 7;
  const levelActive = levelMin > 1 + LEVEL_EPS || levelMax < 7 - LEVEL_EPS;
  if (levelActive) {
    params.levelMin = levelMin;
    params.levelMax = levelMax;
  }
  return params;
}

/** Stable suffix for available / upcoming filter hashes. */
export function buildStructuralFilterHashPart(p: FindStructuralApiParams | undefined): string {
  if (!p) return 's0';
  const clubs = p.clubIds ?? '';
  const entities = p.entityTypes ?? '';
  const hideBar = p.hideBar ? '1' : '0';
  const slots = p.availableSlots ? '1' : '0';
  const level =
    p.levelMin != null || p.levelMax != null
      ? `${p.levelMin ?? 1}-${p.levelMax ?? 7}`
      : 'full';
  const mode = p.mode ?? '';
  return `s:${mode}:${clubs}:${entities}:${hideBar}:${slots}:${level}`;
}
