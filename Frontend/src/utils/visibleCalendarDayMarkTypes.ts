import type { FindDisplayEntityType } from '@/utils/findFilter';

export function visibleCalendarDayMarkTypes(
  types: readonly FindDisplayEntityType[],
  showLeagueMarks: boolean,
  showEventMarks = false,
): FindDisplayEntityType[] {
  return types.filter((type) => {
    if (type === 'LEAGUE') return showLeagueMarks;
    if (type === 'EVENT') return showEventMarks;
    return true;
  });
}
