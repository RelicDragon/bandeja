import { describe, expect, it } from 'vitest';
import { canShowTournamentTableView, canViewTournamentTableByAccess } from './gameResults';

const tournamentInProgress = {
  entityType: 'TOURNAMENT' as const,
  fixedNumberOfSets: 1,
  resultsStatus: 'IN_PROGRESS' as const,
};

describe('tournament table view access', () => {
  it('shows for single-set tournament with results', () => {
    expect(canShowTournamentTableView(tournamentInProgress)).toBe(true);
    expect(
      canShowTournamentTableView({ ...tournamentInProgress, entityType: 'GAME' })
    ).toBe(false);
  });

  it('allows premium, admin, or final', () => {
    expect(canViewTournamentTableByAccess(tournamentInProgress, { isPremium: true })).toBe(true);
    expect(canViewTournamentTableByAccess(tournamentInProgress, { isAdmin: true })).toBe(true);
    expect(
      canViewTournamentTableByAccess(
        { ...tournamentInProgress, resultsStatus: 'FINAL' },
        { isPremium: false, isAdmin: false }
      )
    ).toBe(true);
    expect(
      canViewTournamentTableByAccess(tournamentInProgress, { isPremium: false, isAdmin: false })
    ).toBe(false);
  });
});
