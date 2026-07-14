import { describe, expect, it } from 'vitest';
import {
  buildFindStructuralApiParams,
  buildStructuralFilterHashPart,
  resolveFindEntityTypesParam,
} from './findStructuralApiParams';
import type { GameFilters } from '@/utils/gameFiltersStorage';

const base = {
  filterClubIds: [] as string[],
  filterLevelMin: 1,
  filterLevelMax: 7,
  hideBarGames: false,
  filterAvailableSlots: false,
  gameFilter: false,
  trainingFilter: false,
  tournamentFilter: false,
  leaguesFilter: false,
} as Pick<
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
>;

describe('findStructuralApiParams', () => {
  it('maps entity chips', () => {
    expect(resolveFindEntityTypesParam({ gameFilter: true })).toBe('GAME');
    expect(resolveFindEntityTypesParam({ leaguesFilter: true })).toBe('LEAGUE');
    expect(resolveFindEntityTypesParam({})).toBeUndefined();
  });

  it('builds structural API params used in filter hash', () => {
    const params = buildFindStructuralApiParams(
      {
        ...base,
        filterClubIds: ['a', 'b'],
        hideBarGames: true,
        filterAvailableSlots: true,
        filterLevelMin: 2.5,
        gameFilter: true,
      },
      'calendar',
    );
    expect(params.clubIds).toBe('a,b');
    expect(params.hideBar).toBe(true);
    expect(params.availableSlots).toBe(true);
    expect(params.entityTypes).toBe('GAME');
    expect(params.levelMin).toBe(2.5);
    expect(params.mode).toBe('calendar');

    const hashA = buildStructuralFilterHashPart(params);
    const hashB = buildStructuralFilterHashPart({ ...params, hideBar: false });
    expect(hashA).not.toBe(hashB);
  });

  it('omits idle structural filters', () => {
    const idle = buildFindStructuralApiParams(base, 'upcoming');
    expect(idle.clubIds).toBeUndefined();
    expect(idle.entityTypes).toBeUndefined();
    expect(idle.hideBar).toBeUndefined();
  });
});
