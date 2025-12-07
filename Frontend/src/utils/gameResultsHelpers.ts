import { Game, User, Round } from '@/types';

export const getRestartText = (game: Game | null, t: (key: string) => string) => {
  if (!game) return t('gameResults.restartGame');
  const entityType = game.entityType.toLowerCase();
  if (entityType === 'tournament') return t('gameResults.restartTournament');
  if (entityType === 'bar') return t('gameResults.restartBar');
  if (entityType === 'training') return t('gameResults.restartTraining');
  return t('gameResults.restartGame');
};

export const getFinishText = (game: Game | null, t: (key: string) => string) => {
  if (!game) return t('gameResults.finishGame');
  const entityType = game.entityType.toLowerCase();
  if (entityType === 'tournament') return t('gameResults.finishTournament');
  if (entityType === 'bar') return t('gameResults.finishBar');
  if (entityType === 'training') return t('gameResults.finishTraining');
  return t('gameResults.finishGame');
};

export const getRestartTitle = (game: Game | null, t: (key: string) => string) => {
  if (!game) return t('gameResults.restartGameTitle');
  const entityType = game.entityType.toLowerCase();
  if (entityType === 'tournament') return t('gameResults.restartTournamentTitle');
  if (entityType === 'bar') return t('gameResults.restartBarTitle');
  if (entityType === 'training') return t('gameResults.restartTrainingTitle');
  return t('gameResults.restartGameTitle');
};

export const getFinishTitle = (game: Game | null, t: (key: string) => string) => {
  if (!game) return t('gameResults.finishGameTitle');
  const entityType = game.entityType.toLowerCase();
  if (entityType === 'tournament') return t('gameResults.finishTournamentTitle');
  if (entityType === 'bar') return t('gameResults.finishBarTitle');
  if (entityType === 'training') return t('gameResults.finishTrainingTitle');
  return t('gameResults.finishGameTitle');
};

export const getEditTitle = (game: Game | null, t: (key: string) => string) => {
  if (!game) return t('gameResults.editGameTitle');
  const entityType = game.entityType.toLowerCase();
  if (entityType === 'tournament') return t('gameResults.editTournamentTitle');
  if (entityType === 'bar') return t('gameResults.editBarTitle');
  if (entityType === 'training') return t('gameResults.editTrainingTitle');
  return t('gameResults.editGameTitle');
};

export const getAvailablePlayers = (
  roundId: string,
  matchId: string,
  rounds: Round[],
  players: User[]
): User[] => {
  const round = rounds.find(r => r.id === roundId);
  if (!round) return [];

  const playersInRound = new Set<string>();
  round.matches.forEach(match => {
    match.teamA.forEach(id => playersInRound.add(id));
    match.teamB.forEach(id => playersInRound.add(id));
  });

  const match = round.matches.find(m => m.id === matchId);
  if (!match) return [];

  return players.filter(player => {
    if (playersInRound.has(player.id)) return false;
    return !match.teamA.includes(player.id) && !match.teamB.includes(player.id);
  });
};

export const canEnterResults = (match: { teamA: string[]; teamB: string[] }): boolean => {
  return match.teamA.length > 0 && match.teamB.length > 0;
};

