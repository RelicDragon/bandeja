import type { QueryClient } from '@tanstack/react-query';
import type {
  AgentChatDetailDto,
  AgentEntityRef,
  AgentMessageDto,
  AgentPendingActionDto,
} from '@shared/agentContract';
import { queryKeys } from '@/queries/queryKeys';
import { invalidateMyTabData } from '@/queries/me/useMyTabDataQuery';

/** Pure: insert or replace a message, keeping `seq` order. */
export function upsertMessage(detail: AgentChatDetailDto, message: AgentMessageDto): AgentChatDetailDto {
  const others = detail.messages.filter((m) => m.id !== message.id);
  const messages = [...others, message].sort((a, b) => a.seq - b.seq);
  return { ...detail, messages };
}

/** Pure: an edited user message rewinds the chat — drop it and every later message. */
export function truncateMessagesFrom(detail: AgentChatDetailDto, seq: number): AgentChatDetailDto {
  return { ...detail, messages: detail.messages.filter((m) => m.seq < seq) };
}

/** Pure: insert or replace an action. */
export function upsertAction(detail: AgentChatDetailDto, action: AgentPendingActionDto): AgentChatDetailDto {
  const exists = detail.actions.some((a) => a.id === action.id);
  const actions = exists
    ? detail.actions.map((a) => (a.id === action.id ? action : a))
    : [...detail.actions, action];
  return { ...detail, actions };
}

/**
 * Pure: `action.pending` from the stream. A replay must not turn an action the detail already
 * shows as handled (confirmed, rejected, expired…) back into PENDING.
 */
export function upsertActionFromStream(
  detail: AgentChatDetailDto,
  action: AgentPendingActionDto,
): AgentChatDetailDto {
  const existing = detail.actions.find((a) => a.id === action.id);
  if (existing && existing.status !== 'PENDING' && action.status === 'PENDING') return detail;
  return upsertAction(detail, action);
}

/** Pure: a new user message makes every PENDING action stale (the server marks them EXPIRED). */
export function expirePendingActions(detail: AgentChatDetailDto): AgentChatDetailDto {
  if (!detail.actions.some((a) => a.status === 'PENDING')) return detail;
  return {
    ...detail,
    actions: detail.actions.map((a) => (a.status === 'PENDING' ? { ...a, status: 'EXPIRED' } : a)),
  };
}

export function patchAgentChatDetail(
  client: QueryClient,
  chatId: string,
  patch: (detail: AgentChatDetailDto) => AgentChatDetailDto,
): void {
  client.setQueryData<AgentChatDetailDto>(queryKeys.agent.chat(chatId), (prev) =>
    prev ? patch(prev) : prev,
  );
}

export function gameIdsFromEntities(entities: readonly AgentEntityRef[] | undefined): string[] {
  if (!entities) return [];
  return [...new Set(entities.filter((e) => e.type === 'game').map((e) => e.id))];
}

/**
 * After the agent touched games: refresh each game's detail, and — when something was
 * written — the My payload and past list so Schedule/Past show the change.
 */
export function invalidateTouchedGames(
  client: QueryClient,
  gameIds: readonly string[],
  opts: { wrote: boolean; userId?: string },
): void {
  for (const id of gameIds) {
    void client.invalidateQueries({ queryKey: queryKeys.games.detail(id) });
  }
  if (!opts.wrote) return;
  invalidateMyTabData(opts.userId);
  if (opts.userId) {
    void client.invalidateQueries({ queryKey: queryKeys.games.past(opts.userId) });
  }
}
