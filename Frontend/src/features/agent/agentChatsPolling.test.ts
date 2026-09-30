// @vitest-environment jsdom  (TanStack Query skips refetchInterval timers when `window` is undefined)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import type { AgentChatDto, AgentRunStatus } from '@shared/agentContract';
import {
  AGENT_CHATS_POLL_MS,
  agentChatsPollingOptions,
  finishedAgentRuns,
  hasLiveAgentRun,
} from './agentChatsPolling';

function chat(id: string, run: { id: string; status: AgentRunStatus } | null = null): AgentChatDto {
  return {
    id,
    title: null,
    lastMessagePreview: null,
    activeRun: run,
    createdAt: '2026-10-01T17:00:00.000Z',
    updatedAt: '2026-10-01T17:00:00.000Z',
  };
}

describe('hasLiveAgentRun', () => {
  it('is true only for QUEUED / RUNNING rows', () => {
    expect(hasLiveAgentRun(undefined)).toBe(false);
    expect(hasLiveAgentRun([chat('a')])).toBe(false);
    expect(hasLiveAgentRun([chat('a', { id: 'r', status: 'AWAITING_CONFIRMATION' })])).toBe(false);
    expect(hasLiveAgentRun([chat('a'), chat('b', { id: 'r', status: 'QUEUED' })])).toBe(true);
    expect(hasLiveAgentRun([chat('a', { id: 'r', status: 'RUNNING' })])).toBe(true);
  });
});

describe('finishedAgentRuns', () => {
  it('reports live runs that ended, moved to confirmation, or whose chat vanished', () => {
    const prev = [
      chat('a', { id: 'ra', status: 'RUNNING' }),
      chat('b', { id: 'rb', status: 'QUEUED' }),
      chat('c', { id: 'rc', status: 'RUNNING' }),
      chat('d', { id: 'rd', status: 'QUEUED' }),
      chat('e', { id: 're', status: 'AWAITING_CONFIRMATION' }),
    ];
    const next = [
      chat('a'),
      chat('b', { id: 'rb', status: 'RUNNING' }),
      chat('c', { id: 'rc', status: 'AWAITING_CONFIRMATION' }),
      chat('e'),
    ];
    expect(finishedAgentRuns(prev, next)).toEqual([
      { chatId: 'a', runId: 'ra' },
      { chatId: 'c', runId: 'rc' },
      { chatId: 'd', runId: 'rd' },
    ]);
    expect(finishedAgentRuns(undefined, next)).toEqual([]);
  });
});

describe('agent chats list polling', () => {
  let client: QueryClient;
  beforeEach(() => {
    vi.useFakeTimers();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });
  afterEach(() => {
    client.clear();
    vi.useRealTimers();
  });

  function observe(responses: AgentChatDto[][]) {
    let i = 0;
    const queryFn = vi.fn(async () => responses[Math.min(i++, responses.length - 1)]);
    const observer = new QueryObserver<AgentChatDto[]>(client, {
      queryKey: ['agent', 'chats', 'u1'],
      queryFn,
      ...agentChatsPollingOptions,
    });
    const unsubscribe = observer.subscribe(() => undefined);
    return { queryFn, unsubscribe };
  }

  it('does not poll when no row has an active run', async () => {
    const { queryFn, unsubscribe } = observe([[chat('a'), chat('b', { id: 'r', status: 'AWAITING_CONFIRMATION' })]]);
    await vi.advanceTimersByTimeAsync(0);
    expect(queryFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(AGENT_CHATS_POLL_MS * 6);
    expect(queryFn).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('polls every 5s while a run is queued/running and stops once it ends', async () => {
    const { queryFn, unsubscribe } = observe([
      [chat('a', { id: 'r', status: 'QUEUED' })],
      [chat('a', { id: 'r', status: 'RUNNING' })],
      [chat('a')],
    ]);
    await vi.advanceTimersByTimeAsync(0);
    expect(queryFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(AGENT_CHATS_POLL_MS);
    expect(queryFn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(AGENT_CHATS_POLL_MS);
    expect(queryFn).toHaveBeenCalledTimes(3);
    // Run finished: no more polling.
    await vi.advanceTimersByTimeAsync(AGENT_CHATS_POLL_MS * 6);
    expect(queryFn).toHaveBeenCalledTimes(3);
    unsubscribe();
  });

  it('a list with an active run is stale at once, an idle one is not', () => {
    expect(agentChatsPollingOptions.staleTime({ state: { data: [chat('a', { id: 'r', status: 'RUNNING' })] } })).toBe(0);
    expect(agentChatsPollingOptions.staleTime({ state: { data: [chat('a')] } })).toBeGreaterThan(0);
  });
});
