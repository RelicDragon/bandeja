import { describe, expect, it } from 'vitest';
import type { Club, Court } from '@/types';
import {
  clubSupportsSport,
  effectiveCourtSportFilter,
  filterClubsBySport,
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

const club = (
  id: string,
  sports: Club['sports'],
  courts: Pick<Court, 'sport'>[] = [],
): Club => ({
  id,
  name: id,
  address: '',
  cityId: 'city1',
  sports,
  courts: courts as Court[],
});

describe('courtSport', () => {
  it('detects multi-sport clubs for tabs from explicit club.sports', () => {
    const courts = [court('a', 'PADEL'), court('b', 'TENNIS')];
    expect(resolveClubSportsList(['PADEL', 'TENNIS'], courts)).toEqual(['PADEL', 'TENNIS']);
    expect(shouldShowCourtSportTabs(['PADEL', 'TENNIS'], courts)).toBe(true);
    expect(shouldShowCourtSportTabs(['PADEL', 'TENNIS'], courts, 'TENNIS')).toBe(false);
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

  it('clubSupportsSport uses club.sports when set', () => {
    expect(clubSupportsSport(club('a', ['PADEL', 'TENNIS']), 'TENNIS')).toBe(true);
    expect(clubSupportsSport(club('a', ['PADEL']), 'TENNIS')).toBe(false);
  });

  it('clubSupportsSport infers from courts with null-sport fallback', () => {
    expect(clubSupportsSport(club('a', undefined, [court('x', 'PADEL')]), 'PADEL')).toBe(true);
    expect(clubSupportsSport(club('a', undefined, [court('x', null)]), 'TENNIS')).toBe(true);
    expect(clubSupportsSport(club('a', undefined, [court('x', 'PADEL')]), 'TENNIS')).toBe(false);
    expect(clubSupportsSport(club('a', undefined, []), 'PADEL')).toBe(false);
  });

  it('filterClubsBySport keeps matching clubs only', () => {
    const clubs = [
      club('padel', ['PADEL']),
      club('tennis', ['TENNIS']),
      club('multi', undefined, [court('a', 'PADEL'), court('b', null)]),
    ];
    expect(filterClubsBySport(clubs, 'PADEL').map((c) => c.id)).toEqual(['padel', 'multi']);
  });

  it('filterClubsBySport keeps legacy club via keepClubId', () => {
    const clubs = [club('padel', ['PADEL']), club('tennis', ['TENNIS'])];
    expect(filterClubsBySport(clubs, 'PADEL', 'tennis').map((c) => c.id)).toEqual(['padel', 'tennis']);
  });
});
