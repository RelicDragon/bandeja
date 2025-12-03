import { createId } from '@paralleldrive/cuid2';
import { Match, Round } from '@/types/gameResults';
import { Game } from '@/types';

export function generateFixedRound(
  _game: Game,
  previousRounds: Round[],
  initialSets: Array<{ teamA: number; teamB: number }>
): Match[] {
  if (previousRounds.length === 0) {
    return [{
      id: createId(),
      teamA: [],
      teamB: [],
      sets: initialSets,
    }];
  }

  const previousRound = previousRounds[previousRounds.length - 1];
  const firstRound = previousRounds[0];
  const matches: Match[] = [];

  if (previousRound.matches && previousRound.matches.length > 0) {
    for (let i = 0; i < previousRound.matches.length; i++) {
      const prevMatch = previousRound.matches[i];
      matches.push({
        id: createId(),
        teamA: [...prevMatch.teamA],
        teamB: [...prevMatch.teamB],
        sets: initialSets,
        courtId: firstRound.matches?.[i]?.courtId,
      });
    }
  } else {
    matches.push({
      id: createId(),
      teamA: [],
      teamB: [],
      sets: initialSets,
    });
  }

  return matches;
}

