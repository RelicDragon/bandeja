import { Game } from '@/types';
import { Match, Round } from '@/types/gameResults';

export function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function hasPlayers(match: Match): boolean {
  return match.teamA.length > 0 && match.teamB.length > 0;
}

export function buildMatchesPlayed(playerIds: string[], rounds: Round[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of playerIds) counts.set(id, 0);
  for (const round of rounds) {
    for (const match of round.matches) {
      if (!hasPlayers(match)) continue;
      for (const id of [...match.teamA, ...match.teamB]) {
        if (counts.has(id)) counts.set(id, counts.get(id)! + 1);
      }
    }
  }
  return counts;
}

export function getEligibleParticipants(game: Game) {
  let participants = game.participants.filter(p => p.status === 'PLAYING');

  if (game.genderTeams === 'MEN') {
    participants = participants.filter(p => p.user.gender === 'MALE');
  } else if (game.genderTeams === 'WOMEN') {
    participants = participants.filter(p => p.user.gender === 'FEMALE');
  } else if (game.genderTeams === 'MIX_PAIRS') {
    participants = participants.filter(p =>
      p.user.gender === 'MALE' || p.user.gender === 'FEMALE'
    );
  } else if (game.genderTeams && game.genderTeams !== 'ANY') {
    participants = participants.filter(p => p.user.gender !== 'PREFER_NOT_TO_SAY');
  }

  return participants;
}

export function getNumMatches(game: Game, participants: any[]): number {
  const numCourts = game.gameCourts?.length || 1;

  if (game.genderTeams === 'MIX_PAIRS') {
    const males = participants.filter((p: any) => p.user.gender === 'MALE').length;
    const females = participants.filter((p: any) => p.user.gender === 'FEMALE').length;
    return Math.min(numCourts, Math.floor(Math.min(males, females) / 2));
  }

  return Math.min(numCourts, Math.floor(participants.length / 4));
}

export function getFilteredFixedTeams(game: Game): string[][] {
  const teams = (game.fixedTeams || []).filter(t => t.players.length >= 2);

  if (game.genderTeams === 'MEN') {
    return teams
      .filter(t => t.players.every(p => p.user.gender === 'MALE'))
      .map(t => t.players.map(p => p.userId));
  }
  if (game.genderTeams === 'WOMEN') {
    return teams
      .filter(t => t.players.every(p => p.user.gender === 'FEMALE'))
      .map(t => t.players.map(p => p.userId));
  }
  if (game.genderTeams === 'MIX_PAIRS') {
    return teams
      .filter(t => {
        const g = t.players.map(p => p.user.gender);
        return g.includes('MALE') && g.includes('FEMALE');
      })
      .map(t => t.players.map(p => p.userId));
  }
  if (game.genderTeams && game.genderTeams !== 'ANY') {
    return teams
      .filter(t => t.players.every(p => p.user.gender !== 'PREFER_NOT_TO_SAY'))
      .map(t => t.players.map(p => p.userId));
  }

  return teams.map(t => t.players.map(p => p.userId));
}
