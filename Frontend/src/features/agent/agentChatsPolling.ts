import type { AgentChatDto, AgentRunStatus } from '@shared/agentContract';

/** List refresh cadence while any row has a queued or running run. */
export const AGENT_CHATS_POLL_MS = 5_000;
export const AGENT_CHATS_STALE_MS = 30_000;

/** Runs that progress on their own. AWAITING_CONFIRMATION waits for the user, so no polling. */
export function isLiveAgentRunStatus(status: AgentRunStatus | null | undefined): boolean {
  return status === 'QUEUED' || status === 'RUNNING';
}

export function hasLiveAgentRun(chats: readonly AgentChatDto[] | undefined): boolean {
  return Boolean(chats?.some((c) => isLiveAgentRunStatus(c.activeRun?.status)));
}

interface ChatsQueryLike {
  state: { data?: { chats: readonly AgentChatDto[] } | undefined };
}

/**
 * `useQuery` options for `agent.chats()`: poll every 5s only while a row has a live run, and
 * treat such a list as stale so coming back to the list refetches at once.
 */
export const agentChatsPollingOptions = {
  refetchInterval: (query: ChatsQueryLike) =>
    hasLiveAgentRun(query.state.data?.chats) ? AGENT_CHATS_POLL_MS : false,
  staleTime: (query: ChatsQueryLike) =>
    hasLiveAgentRun(query.state.data?.chats) ? 0 : AGENT_CHATS_STALE_MS,
};

export interface FinishedAgentRun {
  chatId: string;
  runId: string;
}

/**
 * Live runs in `prev` that are no longer live in `next` (finished, cancelled, failed, now
 * awaiting confirmation, or the chat is gone). Their chat detail needs a refetch.
 */
export function finishedAgentRuns(
  prev: readonly AgentChatDto[] | undefined,
  next: readonly AgentChatDto[] | undefined,
): FinishedAgentRun[] {
  if (!prev) return [];
  const nextById = new Map((next ?? []).map((c) => [c.id, c]));
  const out: FinishedAgentRun[] = [];
  for (const chat of prev) {
    const run = chat.activeRun;
    if (!run || !isLiveAgentRunStatus(run.status)) continue;
    const now = nextById.get(chat.id)?.activeRun;
    if (now && now.id === run.id && isLiveAgentRunStatus(now.status)) continue;
    out.push({ chatId: chat.id, runId: run.id });
  }
  return out;
}
