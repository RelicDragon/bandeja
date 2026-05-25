import { describe, expect, it } from 'vitest';
import type { LeagueStanding } from '@/api/leagues';
import {
  buildBracketSeedLabels,
  formatSeedOptionLabel,
  getStandingDisplayName,
} from './playoffWizardSeedLabels.util';

describe('playoffWizardSeedLabels.util (UX-B5)', () => {
  it('builds seed labels from ordered participant ids', () => {
    const standings = new Map<string, LeagueStanding>([
      [
        'p1',
        {
          id: 'p1',
          user: { firstName: 'Alex', lastName: 'One' },
        } as LeagueStanding,
      ],
      [
        'p2',
        {
          id: 'p2',
          leagueTeam: {
            players: [{ user: { firstName: 'Sam', lastName: 'Two' } }],
          },
        } as LeagueStanding,
      ],
    ]);
    expect(buildBracketSeedLabels(['p2', 'p1'], standings)).toEqual({
      1: 'Sam Two',
      2: 'Alex One',
    });
  });

  it('formatSeedOptionLabel includes team name when known', () => {
    expect(formatSeedOptionLabel(3, { 3: 'Team Gamma' })).toBe('#3 · Team Gamma');
    expect(formatSeedOptionLabel(3)).toBe('#3');
  });

  it('getStandingDisplayName prefers user then team', () => {
    expect(
      getStandingDisplayName({
        id: 's1',
        user: { firstName: 'A', lastName: 'B' },
      } as LeagueStanding)
    ).toBe('A B');
  });
});
