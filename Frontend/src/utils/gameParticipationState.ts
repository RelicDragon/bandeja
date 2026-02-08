import type { GameParticipant, Game } from '@/types';
import { isParticipantPlaying, isParticipantGuest, isParticipantInQueue } from './participantStatus';
import { isUserGameAdminOrOwner } from './gameResults';

export interface GameParticipationState {
  userParticipant: GameParticipant | undefined;
  isParticipant: boolean;
  isParticipantNonGuest: boolean;
  isPlaying: boolean;
  isGuest: boolean;
  hasPendingInvite: boolean;
  isInJoinQueue: boolean;
  isAdminOrOwner: boolean;
  isOwner: boolean;
  playingCount: number;
  isFull: boolean;
}

export const EMPTY_GAME_PARTICIPATION_STATE: GameParticipationState = {
  userParticipant: undefined,
  isParticipant: false,
  isParticipantNonGuest: false,
  isPlaying: false,
  isGuest: false,
  hasPendingInvite: false,
  isInJoinQueue: false,
  isAdminOrOwner: false,
  isOwner: false,
  playingCount: 0,
  isFull: false,
};

export function getGameParticipationState(
  participants: GameParticipant[],
  userId: string | undefined,
  game?: Game | null
): GameParticipationState {
  const list = participants ?? [];
  if (!list.length && !userId) {
    return { ...EMPTY_GAME_PARTICIPATION_STATE };
  }
  const userParticipant = userId ? list.find(p => p.userId === userId) : undefined;
  const playingCount = list.filter(p => p.status === 'PLAYING').length;

  const isParticipant = !!userParticipant;
  const isParticipantNonGuest = !!userParticipant && userParticipant.status !== 'GUEST';
  const isPlaying = userParticipant ? isParticipantPlaying(userParticipant) : false;
  const isGuest = userParticipant ? isParticipantGuest(userParticipant) : false;
  const hasPendingInvite = userParticipant?.status === 'INVITED';
  const isInJoinQueue = userParticipant ? isParticipantInQueue(userParticipant) : false;
  const isAdminOrOwner = game && userId
    ? isUserGameAdminOrOwner(game, userId)
    : (userParticipant?.role === 'ADMIN' || userParticipant?.role === 'OWNER');
  const isOwner = userParticipant?.role === 'OWNER';

  return {
    userParticipant,
    isParticipant,
    isParticipantNonGuest,
    isPlaying,
    isGuest,
    hasPendingInvite,
    isInJoinQueue,
    isAdminOrOwner,
    isOwner,
    playingCount,
    isFull: game ? game.entityType !== 'BAR' && playingCount >= game.maxParticipants : false,
  };
}
