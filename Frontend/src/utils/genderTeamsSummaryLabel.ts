import type { GenderTeam } from '@/types';

export function genderTeamsSummaryLabelKey(gender: GenderTeam): string | null {
  switch (gender) {
    case 'MEN':
      return 'createGame.genderTeams.men';
    case 'WOMEN':
      return 'createGame.genderTeams.women';
    case 'MIX_PAIRS':
      return 'createGame.genderTeams.mixPairs';
    default:
      return null;
  }
}
