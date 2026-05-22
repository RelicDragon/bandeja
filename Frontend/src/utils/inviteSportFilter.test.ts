import { describe, expect, it } from 'vitest';
import {
  invitableUserPlaysSport,
  isInviteSportFilterActive,
  passesInviteSportFilter,
  resolveInviteSportFilterTarget,
} from './inviteSportFilter';

describe('inviteSportFilter', () => {
  it('defaults to game sport filter active only when not game', () => {
    expect(isInviteSportFilterActive('game')).toBe(false);
    expect(isInviteSportFilterActive('all')).toBe(true);
    expect(isInviteSportFilterActive('PADEL')).toBe(true);
  });

  it('resolves filter target', () => {
    expect(resolveInviteSportFilterTarget('game', 'TENNIS')).toBe('TENNIS');
    expect(resolveInviteSportFilterTarget('all', 'TENNIS')).toBeNull();
    expect(resolveInviteSportFilterTarget('PADEL', 'TENNIS')).toBe('PADEL');
  });

  it('checks sportsEnabled membership', () => {
    expect(invitableUserPlaysSport({ sportsEnabled: ['PADEL', 'TENNIS'] }, 'TENNIS')).toBe(true);
    expect(invitableUserPlaysSport({ sportsEnabled: ['PADEL'] }, 'TENNIS')).toBe(false);
    expect(invitableUserPlaysSport({ primarySport: 'PADEL' }, 'PADEL')).toBe(true);
  });

  it('passes all when filter is all', () => {
    expect(passesInviteSportFilter({ sportsEnabled: ['PADEL'] }, 'all', 'TENNIS')).toBe(true);
    expect(passesInviteSportFilter({ sportsEnabled: ['PADEL'] }, 'game', 'TENNIS')).toBe(false);
    expect(passesInviteSportFilter({ sportsEnabled: ['PADEL', 'TENNIS'] }, 'game', 'TENNIS')).toBe(true);
  });
});
