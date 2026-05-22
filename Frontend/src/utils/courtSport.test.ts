import { describe, expect, it } from 'vitest';
import type { Court } from '@/types';
import {
  filterCourtsBySport,
  getDistinctCourtSports,
  resolveDefaultCourtSportTab,
  shouldShowCourtSportTabs,
} from './courtSport';

const court = (id: string, sport: Court['sport']): Court => ({
  id,
  name: id,
  clubId: 'club1',
  sport,
  isIndoor: false,
});

describe('courtSport', () => {
  it('detects multi-sport clubs for tabs', () => {
    const courts = [court('a', 'PADEL'), court('b', 'TENNIS')];
    expect(getDistinctCourtSports(courts)).toEqual(['PADEL', 'TENNIS']);
    expect(shouldShowCourtSportTabs(courts)).toBe(true);
    expect(shouldShowCourtSportTabs([court('a', 'PADEL')])).toBe(false);
  });

  it('filters by sport including null-sport courts', () => {
    const courts = [court('a', 'PADEL'), court('b', 'TENNIS'), court('c', null)];
    expect(filterCourtsBySport(courts, 'TENNIS').map((c) => c.id)).toEqual(['b', 'c']);
  });

  it('resolves default tab from preferred sport', () => {
    expect(resolveDefaultCourtSportTab(['PADEL', 'TENNIS'], 'TENNIS')).toBe('TENNIS');
    expect(resolveDefaultCourtSportTab(['PADEL', 'TENNIS'], 'SQUASH')).toBe('PADEL');
  });
});
