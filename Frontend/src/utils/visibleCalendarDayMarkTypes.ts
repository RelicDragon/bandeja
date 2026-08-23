import type { FindDisplayEntityType } from '@/utils/findFilter';

export function visibleCalendarDayMarkTypes(
  types: readonly FindDisplayEntityType[],
  leaguesFilter: boolean,
): FindDisplayEntityType[] {
  if (leaguesFilter) return [...types];
  return types.filter((type) => type !== 'LEAGUE');
}
