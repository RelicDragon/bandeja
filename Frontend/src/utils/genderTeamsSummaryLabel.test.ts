import { describe, expect, it } from 'vitest';
import { genderTeamsSummaryLabelKey } from './genderTeamsSummaryLabel';

describe('genderTeamsSummaryLabelKey', () => {
  it('returns label key for restricted genders', () => {
    expect(genderTeamsSummaryLabelKey('MEN')).toBe('createGame.genderTeams.men');
    expect(genderTeamsSummaryLabelKey('WOMEN')).toBe('createGame.genderTeams.women');
    expect(genderTeamsSummaryLabelKey('MIX_PAIRS')).toBe('createGame.genderTeams.mixPairs');
  });

  it('returns null for ANY', () => {
    expect(genderTeamsSummaryLabelKey('ANY')).toBeNull();
  });
});
