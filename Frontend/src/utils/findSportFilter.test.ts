import { describe, expect, it } from 'vitest';
import {
  findSportFilterToApiParam,
  isFindSportFilterActive,
  resolveFindAdSportContext,
  shouldShowGameCardSportGlyph,
  shouldShowFindSportFilterSection,
} from './findSportFilter';

describe('findSportFilter', () => {
  it('omits API param for primary default', () => {
    expect(findSportFilterToApiParam('primary', 'PADEL')).toBeUndefined();
    expect(findSportFilterToApiParam(undefined, 'TENNIS')).toBeUndefined();
  });

  it('sends all or specific sport', () => {
    expect(findSportFilterToApiParam('all', 'PADEL')).toBe('all');
    expect(findSportFilterToApiParam('TENNIS', 'PADEL')).toBe('TENNIS');
  });

  it('detects active sport filter', () => {
    expect(isFindSportFilterActive('primary', 'PADEL')).toBe(false);
    expect(isFindSportFilterActive('all', 'PADEL')).toBe(true);
    expect(isFindSportFilterActive('TENNIS', 'PADEL')).toBe(true);
  });

  it('glyph rules for Find cards', () => {
    expect(shouldShowGameCardSportGlyph('PADEL', 'PADEL', 'primary')).toBe(false);
    expect(shouldShowGameCardSportGlyph('TENNIS', 'PADEL', 'primary')).toBe(true);
    expect(shouldShowGameCardSportGlyph('PADEL', 'PADEL', 'all')).toBe(true);
  });

  it('shows filter section for multi-sport users', () => {
    expect(shouldShowFindSportFilterSection({ sportsEnabled: ['PADEL'] } as any)).toBe(false);
    expect(shouldShowFindSportFilterSection({ sportsEnabled: ['PADEL', 'TENNIS'] } as any)).toBe(true);
  });

  it('resolves ad sport context for Find placements', () => {
    expect(resolveFindAdSportContext('primary', 'BADMINTON')).toBe('BADMINTON');
    expect(resolveFindAdSportContext('all', 'PADEL')).toBeUndefined();
    expect(resolveFindAdSportContext('TENNIS', 'PADEL')).toBe('TENNIS');
  });

  it('shows filter section when sportsPlayed has entries', () => {
    expect(
      shouldShowFindSportFilterSection({ sportsEnabled: ['PADEL'], sportsPlayed: { TENNIS: 4 } } as any),
    ).toBe(true);
  });
});
