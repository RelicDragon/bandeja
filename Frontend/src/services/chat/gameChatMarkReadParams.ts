import type { ChatContextType } from '@/api/chat';
import type { Game } from '@/types';
import type { ChatType } from '@/types';
import type { CoordinatorEnterParams } from '@/services/chat/unreadCoordinator';
import { isParticipantPlaying } from '@/utils/participantStatus';
import { isPendingGameInvite } from '@/utils/gameInviteParticipant';

export function buildGameChatMarkReadParams(opts: {
  id: string | undefined;
  contextType: ChatContextType;
  game: Game | null;
  userId: string | undefined;
  gameChatType: ChatType;
  groupChannelId?: string;
}): CoordinatorEnterParams | null {
  const { id, contextType, game, userId, gameChatType, groupChannelId } = opts;
  if (!id || !userId) return null;

  if (contextType === 'GAME') {
    if (!game) return null;
    const participant = game.participants.find((p) => p.userId === userId);
    const isParticipant = !!participant;
    const hasPendingInvite =
      game.participants?.some((p) => p.userId === userId && isPendingGameInvite(p)) ?? false;
    const isGuest =
      game.participants.some(
        (p) => p.userId === userId && (p.status === 'GUEST' || !isParticipantPlaying(p))
      ) ?? false;
    if (!isParticipant && !hasPendingInvite && !isGuest && !game.isPublic) return null;
    const parentParticipant = game.parent?.participants?.find((p) => p.userId === userId);
    return {
      contextType: 'GAME',
      contextId: id,
      rawContextType: contextType,
      game: { id, status: game.status },
      participant: participant ?? null,
      parentParticipant: parentParticipant ?? null,
      gameChatType,
    };
  }

  if (contextType === 'USER') {
    return { contextType: 'USER', contextId: id, rawContextType: contextType };
  }

  if (contextType === 'GROUP') {
    return { contextType: 'GROUP', contextId: id, rawContextType: contextType };
  }

  if (contextType === 'BUG') {
    return {
      contextType: 'GROUP',
      contextId: id,
      rawContextType: contextType,
      groupChannelId,
    };
  }

  return null;
}
