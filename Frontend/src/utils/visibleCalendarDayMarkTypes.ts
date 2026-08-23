import type { FindDisplayEntityType } from '@/utils/findFilter';

export function visibleCalendarDayMarkTypes(
  types: readonly FindDisplayEntityType[],
  showLeagueMarks: boolean,
): FindDisplayEntityType[] {
  if (showLeagueMarks) return [...types];
  return types.filter((type) => type !== 'LEAGUE');
}
