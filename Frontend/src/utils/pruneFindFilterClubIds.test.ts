import { describe, expect, it } from 'vitest';
import { buildFindFilterAllowedClubIds, pruneFindFilterClubIds } from './pruneFindFilterClubIds';

describe('pruneFindFilterClubIds', () => {
  it('does not clear venue or bar selection while catalogs are loading', () => {
    expect(pruneFindFilterClubIds(['venue-1', 'bar-1'], new Set(), false)).toBeNull();
  });

  it('keeps selected bars when catalogs are ready and hideBarGames is off', () => {
    const allowed = buildFindFilterAllowedClubIds(['venue-1'], ['bar-1', 'bar-2'], false);
    expect(pruneFindFilterClubIds(['bar-1', 'venue-1'], allowed, true)).toBeNull();
  });

  it('drops bars from allowed set when hideBarGames is on', () => {
    const allowed = buildFindFilterAllowedClubIds(['venue-1'], ['bar-1'], true);
    expect(allowed.has('bar-1')).toBe(false);
    expect(pruneFindFilterClubIds(['venue-1', 'bar-1'], allowed, true)).toEqual(['venue-1']);
  });

  it('drops ids missing from loaded catalogs', () => {
    const allowed = buildFindFilterAllowedClubIds(['a'], ['bar-1'], false);
    expect(pruneFindFilterClubIds(['a', 'gone', 'bar-1'], allowed, true)).toEqual(['a', 'bar-1']);
  });

  it('returns null when all selected ids remain allowed', () => {
    expect(pruneFindFilterClubIds(['a'], new Set(['a', 'b']), true)).toBeNull();
  });
});
