import { gamesApi } from '@/api/games';
import { useAuthStore } from '@/store/authStore';
import type { Game } from '@/types';
import type { ChatType } from '@/types';
import {
  getGameChatTypesForUnreadAndMarkRead,
  type GameChatParticipantForUnread,
  type ParentParticipantForUnread,
} from '@/utils/gameChatTypesForUnread';

export type GameChatSyncContext = {
  game: { status: string };
  participant: GameChatParticipantForUnread | null;
  parentParticipant?: ParentParticipantForUnread | null;
  isParentGameAdminOrOwner?: boolean;
};

const contextByGameId = new Map<string, GameChatSyncContext>();

export function registerGameChatSyncContext(gameId: string, game: Game, userId: string): void {
  const participant = game.participants?.find((p) => p.userId === userId) ?? null;
  const parentParticipant = game.parent?.participants?.find((p) => p.userId === userId) ?? null;
  contextByGameId.set(gameId, {
    game: { status: game.status },
    participant: participant ? { status: participant.status, role: participant.role } : null,
    parentParticipant: parentParticipant ? { role: parentParticipant.role } : null,
  });
}

export function setGameChatSyncContext(gameId: string, context: GameChatSyncContext): void {
  contextByGameId.set(gameId, context);
}

export function getGameChatSyncContext(gameId: string): GameChatSyncContext | undefined {
  return contextByGameId.get(gameId);
}

export function clearGameChatSyncContextCache(): void {
  contextByGameId.clear();
}

function typesFromContext(context: GameChatSyncContext): ChatType[] {
  return getGameChatTypesForUnreadAndMarkRead(
    context.game,
    context.participant,
    context.parentParticipant,
    context.isParentGameAdminOrOwner
  );
}

export async function resolveAccessibleGameChatTypes(
  gameId: string,
  refContext?: GameChatSyncContext | null
): Promise<ChatType[]> {
  const cached = refContext ?? contextByGameId.get(gameId);
  if (cached) return typesFromContext(cached);

  const userId = useAuthStore.getState().user?.id;
  if (!userId) return ['PUBLIC'];

  try {
    const response = await gamesApi.getById(gameId);
    registerGameChatSyncContext(gameId, response.data, userId);
    return typesFromContext(contextByGameId.get(gameId)!);
  } catch {
    return ['PUBLIC'];
  }
}
