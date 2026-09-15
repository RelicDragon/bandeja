import type { Game } from '@/types';

export type FindEntityChipKey = 'game' | 'training' | 'tournament' | 'leagues' | 'events';

export type FindEntityChipFilters = {
  gameFilter?: boolean;
  trainingFilter?: boolean;
  tournamentFilter?: boolean;
  leaguesFilter?: boolean;
  eventsFilter?: boolean;
};

export type FindEntityChipState = {
  gameFilter: boolean;
  trainingFilter: boolean;
  tournamentFilter: boolean;
  leaguesFilter: boolean;
  eventsFilter: boolean;
};

const ENTITY_TYPE_PARAM_ORDER = ['GAME', 'TRAINING', 'TOURNAMENT', 'LEAGUE', 'EVENT'] as const;

function isLeagueEntityType(entityType: Game['entityType'] | string): boolean {
  return entityType === 'LEAGUE' || entityType === 'LEAGUE_SEASON';
}

export function countActiveFindEntityChips(filters: FindEntityChipFilters): number {
  return [
    filters.gameFilter,
    filters.trainingFilter,
    filters.tournamentFilter,
    filters.leaguesFilter,
    filters.eventsFilter,
  ].filter(Boolean).length;
}

export function hasActiveFindEntityChip(filters: FindEntityChipFilters): boolean {
  return countActiveFindEntityChips(filters) > 0;
}

export function gameMatchesFindEntityChips(
  entityType: Game['entityType'] | string,
  filters: FindEntityChipFilters,
  options?: { idleIncludesEvent?: boolean },
): boolean {
  if (!hasActiveFindEntityChip(filters)) {
    return options?.idleIncludesEvent === true || entityType !== 'EVENT';
  }
  if (filters.gameFilter && entityType === 'GAME') return true;
  if (filters.trainingFilter && entityType === 'TRAINING') return true;
  if (filters.tournamentFilter && entityType === 'TOURNAMENT') return true;
  if (filters.leaguesFilter && isLeagueEntityType(entityType)) return true;
  if (filters.eventsFilter && entityType === 'EVENT') return true;
  return false;
}

export function resolveFindEntityTypesParam(filters: FindEntityChipFilters): string | undefined {
  const types: string[] = [];
  if (filters.gameFilter) types.push('GAME');
  if (filters.trainingFilter) types.push('TRAINING');
  if (filters.tournamentFilter) types.push('TOURNAMENT');
  if (filters.leaguesFilter) types.push('LEAGUE');
  if (filters.eventsFilter) types.push('EVENT');
  if (types.length === 0) return undefined;
  return ENTITY_TYPE_PARAM_ORDER.filter((type) => types.includes(type)).join(',');
}

export function toggleFindEntityChip(
  state: FindEntityChipState,
  type: FindEntityChipKey,
): FindEntityChipState {
  switch (type) {
    case 'game':
      return { ...state, gameFilter: !state.gameFilter };
    case 'training':
      return { ...state, trainingFilter: !state.trainingFilter };
    case 'tournament':
      return { ...state, tournamentFilter: !state.tournamentFilter };
    case 'leagues':
      return { ...state, leaguesFilter: !state.leaguesFilter };
    case 'events':
      return { ...state, eventsFilter: !state.eventsFilter };
  }
}
