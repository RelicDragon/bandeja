import { describe, expect, it } from 'vitest';
import type { Court } from '@/types';
import {
  effectiveCourtSportFilter,
  filterCourtsByClubSports,
  filterCourtsBySport,
  getDistinctCourtSports,
  resolveClubSportsList,
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
  it('detects multi-sport clubs for tabs from explicit club.sports', () => {
    const courts = [court('a', 'PADEL'), court('b', 'TENNIS')];
    expect(resolveClubSportsList(['PADEL', 'TENNIS'], courts)).toEqual(['PADEL', 'TENNIS']);
    expect(shouldShowCourtSportTabs(['PADEL', 'TENNIS'], courts)).toBe(true);
    expect(shouldShowCourtSportTabs(['PADEL'], courts)).toBe(false);
  });

  it('falls back to court sports when club.sports missing', () => {
    const courts = [court('a', 'PADEL'), court('b', 'TENNIS')];
    expect(getDistinctCourtSports(courts)).toEqual(['PADEL', 'TENNIS']);
    expect(resolveClubSportsList(undefined, courts)).toEqual(['PADEL', 'TENNIS']);
  });

  it('filters by sport including null-sport courts', () => {
    const courts = [court('a', 'PADEL'), court('b', 'TENNIS'), court('c', null)];
    expect(filterCourtsBySport(courts, 'TENNIS').map((c) => c.id)).toEqual(['b', 'c']);
  });

  it('filters courts to club.sports', () => {
    const courts = [court('a', 'PADEL'), court('b', 'TENNIS')];
    expect(filterCourtsByClubSports(courts, ['PADEL']).map((c) => c.id)).toEqual(['a']);
  });

  it('ignores preferred sport outside club.sports', () => {
    expect(effectiveCourtSportFilter(['PADEL'], 'TENNIS')).toBeUndefined();
    expect(effectiveCourtSportFilter(['PADEL', 'TENNIS'], 'TENNIS')).toBe('TENNIS');
  });

  it('resolves default tab from preferred sport', () => {
    expect(resolveDefaultCourtSportTab(['PADEL', 'TENNIS'], 'TENNIS')).toBe('TENNIS');
    expect(resolveDefaultCourtSportTab(['PADEL', 'TENNIS'], 'SQUASH')).toBe('PADEL');
  });
});
