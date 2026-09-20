import { describe, expect, it } from 'vitest';
import { applyFindClubIdsFromUrl } from './applyFindClubIdsFromUrl';
import { parseFindClubIdsParam } from '@/hooks/useFindFromUrl';

/** PRD 354 — `/find?clubIds=` is how the club page's "See all on Find" lands. */
describe('parseFindClubIdsParam', () => {
  it('splits, trims and de-duplicates', () => {
    expect(parseFindClubIdsParam('club-1, club-2 ,club-1')).toEqual(['club-1', 'club-2']);
  });

  it('is empty for a missing or blank param', () => {
    expect(parseFindClubIdsParam(null)).toEqual([]);
    expect(parseFindClubIdsParam('')).toEqual([]);
    expect(parseFindClubIdsParam(' , , ')).toEqual([]);
  });
});

describe('applyFindClubIdsFromUrl', () => {
  it('leaves saved filters alone when the URL carries no club', () => {
    expect(
      applyFindClubIdsFromUrl([], { filterClubIds: ['saved-1'], filtersPanelOpen: false }),
    ).toBeNull();
  });

  it('applies the URL club and opens the filters panel', () => {
    expect(
      applyFindClubIdsFromUrl(['club-1'], { filterClubIds: [], filtersPanelOpen: false }),
    ).toEqual({ filterClubIds: ['club-1'], filtersPanelOpen: true });
  });

  it('replaces a different saved selection', () => {
    expect(
      applyFindClubIdsFromUrl(['club-2'], { filterClubIds: ['club-1'], filtersPanelOpen: true }),
    ).toEqual({ filterClubIds: ['club-2'], filtersPanelOpen: true });
  });

  it('stops once the filter already matches, so the effect cannot loop', () => {
    expect(
      applyFindClubIdsFromUrl(['club-1'], { filterClubIds: ['club-1'], filtersPanelOpen: true }),
    ).toBeNull();
  });

  it('still opens the panel when the filter matches but the panel is shut', () => {
    expect(
      applyFindClubIdsFromUrl(['club-1'], { filterClubIds: ['club-1'], filtersPanelOpen: false }),
    ).toEqual({ filtersPanelOpen: true });
  });

  it('ignores order when comparing', () => {
    expect(
      applyFindClubIdsFromUrl(['b', 'a'], { filterClubIds: ['a', 'b'], filtersPanelOpen: true }),
    ).toBeNull();
  });
});
