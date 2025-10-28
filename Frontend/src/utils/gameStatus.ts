import { GameStatus } from '@/types';

export const calculateGameStatus = (
  game: {
    startTime: string;
    endTime: string;
    maxParticipants: number;
    participants: any[];
    hasResults: boolean;
  },
  serverTime: string
): GameStatus => {
  const now = new Date(serverTime);
  const startTime = new Date(game.startTime);
  const endTime = new Date(game.endTime);
  
  const hoursUntilStart = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
  const hoursSinceEnd = (now.getTime() - endTime.getTime()) / (1000 * 60 * 60);
  
  const isFull = game.participants.length >= game.maxParticipants;
  
  if (hoursSinceEnd > 24) {
    return 'ARCHIVED';
  }
  
  if (game.hasResults) {
    return 'FINISHED';
  }
  
  if (hoursUntilStart <= 0 && hoursSinceEnd < 0) {
    return 'STARTED';
  }
  
  // Game has ended but no results submitted yet
  if (hoursSinceEnd >= 0 && !game.hasResults) {
    return 'FINISHED';
  }
  
  if (hoursUntilStart > 0 && isFull) {
    return 'READY';
  }
  
  if (hoursUntilStart > 0 && !isFull) {
    return 'ANNOUNCED';
  }
  
  return 'ANNOUNCED';
};
