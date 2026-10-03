// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentChatDetailDto, AgentMessageDto } from '@shared/agentContract';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({ setMessageFeedback: vi.fn() }));
const haptic = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
    i18n: { language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/api/agent', () => ({ agentApi: api }));
vi.mock('@/store/authStore', () => ({
  useAuthStore: (select: (s: { user: { id: string } | null }) => unknown) => select({ user: null }),
}));
vi.mock('@/utils/displayPreferences', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/displayPreferences')>()),
  resolveDisplaySettings: () => ({ locale: 'en-GB', hour12: false }),
  formatGameTime: (iso: string) => new Date(iso).toISOString().slice(11, 16),
}));
vi.mock('@/utils/haptics', () => ({ hapticSelection: () => haptic() }));
vi.mock('@/hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => true }));
vi.mock('@/components/chat/useMessageInputMultiline', () => ({ useMessageInputMultiline: () => ({ inputContainerRef: { current: null } }) }));
vi.mock('@/features/agent/voice/useAgentDictation', () => ({
  DICTATION_LEVEL_HISTORY: 4,
  useAgentDictation: () => ({ phase: 'idle', levels: [], durationMs: 0, start: vi.fn(), finish: vi.fn(), cancel: vi.fn() }),
}));

const { AgentJumpToBottom } = await import('@/components/agent/AgentJumpToBottom');
const { AgentLimitCard, AgentRunErrorBanner } = await import('@/components/agent/AgentLimitCard');
const { AgentMessageActions } = await import('@/components/agent/AgentMessageActions');
const { AgentComposer } = await import('@/components/agent/AgentComposer');
const { useSetAgentMessageFeedbackMutation } = await import('@/queries/agent/useAgentQueries');
const { queryKeys } = await import('@/queries/queryKeys');
const { useAgentLimitClock } = await import('./agentLimits');
const { agentErrorRetryAt } = await import('./agentErrors');
const { lastAgentReplyKey, lastAgentUserItem, sameAgentRenderItem } = await import('./agentRenderItemEqual');

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  haptic.mockReset();
  api.setMessageFeedback.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const byLabel = (label: string) => container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);

describe('jump to bottom', () => {
  it('shows only when scrolled away, with a dot for new content, and jumps on tap', () => {
    const onJump = vi.fn();
    act(() => root.render(<AgentJumpToBottom visible={false} unread={false} onJump={onJump} />));
    expect(byLabel('agent.thread.jumpToBottom')).toBeNull();

    act(() => root.render(<AgentJumpToBottom visible unread={false} onJump={onJump} />));
    const button = byLabel('agent.thread.jumpToBottom');
    expect(button).not.toBeNull();
    expect(button?.querySelector('.bg-primary-500')).toBeNull();

    act(() => root.render(<AgentJumpToBottom visible unread onJump={onJump} />));
    const withDot = byLabel('agent.thread.jumpToBottomNew');
    expect(withDot?.querySelector('.bg-primary-500')).not.toBeNull();
    act(() => withDot?.click());
    expect(onJump).toHaveBeenCalledOnce();
  });
});

describe('retry and regenerate wiring', () => {
  it('run error banner: Retry calls back; no button without a message to resend', () => {
    const onRetry = vi.fn();
    act(() => root.render(<AgentRunErrorBanner code="TIMEOUT" onRetry={onRetry} />));
    expect(container.textContent).toContain('agent.errors.TIMEOUT');
    const retry = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('common.retry'));
    act(() => retry?.click());
    expect(onRetry).toHaveBeenCalledOnce();

    act(() => root.render(<AgentRunErrorBanner code="SOMETHING_NEW" />));
    expect(container.textContent).toContain('agent.errors.INTERNAL');
    expect(container.querySelector('button')).toBeNull();
  });

  it('regenerate shows only when offered and resends through the callback', () => {
    const onRegenerate = vi.fn();
    act(() => root.render(<AgentMessageActions align="start" getText={() => 'x'} />));
    expect(byLabel('agent.message.regenerate')).toBeNull();
    act(() => root.render(<AgentMessageActions align="start" getText={() => 'x'} onRegenerate={onRegenerate} />));
    act(() => byLabel('agent.message.regenerate')?.click());
    expect(onRegenerate).toHaveBeenCalledOnce();
    expect(haptic).toHaveBeenCalled();
  });

  it('targets: the newest own message, and the reply only while it is the newest turn', () => {
    const user = { kind: 'user' as const, key: 'm-u1', messageId: 'u1', seq: 1, text: 'Hi' };
    const reply = { kind: 'assistantText' as const, key: 't-m-u1-0', text: 'Hello', streaming: false, messageId: 'a1' };
    const replies = new Map([['t-m-u1-0', 'Hello']]);
    expect(lastAgentUserItem([user, reply])).toBe(user);
    expect(lastAgentReplyKey([user, reply], replies)).toBe('t-m-u1-0');
    const next = { ...user, key: 'm-u2', messageId: 'u2', seq: 3 };
    expect(lastAgentReplyKey([user, reply, next], replies)).toBeNull();
    expect(lastAgentUserItem([user, reply, next])).toBe(next);
  });

  it('settled rows compare equal across rebuilds; changed text does not', () => {
    const a = { kind: 'assistantText' as const, key: 'k', text: 'Hello', streaming: false };
    expect(sameAgentRenderItem(a, { ...a })).toBe(true);
    expect(sameAgentRenderItem(a, { ...a, text: 'Hello!' })).toBe(false);
    const entities: never[] = [];
    const tool = { callId: 'c', label: 'L', status: 'ok' as const, summary: 's', entities };
    expect(
      sameAgentRenderItem({ kind: 'toolGroup', key: 'g', tools: [tool] }, { kind: 'toolGroup', key: 'g', tools: [{ ...tool }] }),
    ).toBe(true);
  });
});

describe('feedback', () => {
  it('thumbs toggle; a down vote opens an optional comment', () => {
    const onFeedback = vi.fn();
    act(() => root.render(<AgentMessageActions align="start" getText={() => 'x'} onFeedback={onFeedback} />));
    act(() => byLabel('agent.message.goodReply')?.click());
    expect(onFeedback).toHaveBeenLastCalledWith('up');

    act(() => root.render(<AgentMessageActions align="start" getText={() => 'x'} feedback="up" onFeedback={onFeedback} />));
    expect(byLabel('agent.message.goodReply')?.getAttribute('aria-pressed')).toBe('true');
    act(() => byLabel('agent.message.goodReply')?.click());
    expect(onFeedback).toHaveBeenLastCalledWith(null);

    act(() => byLabel('agent.message.badReply')?.click());
    expect(onFeedback).toHaveBeenLastCalledWith('down');
    act(() => root.render(<AgentMessageActions align="start" getText={() => 'x'} feedback="down" onFeedback={onFeedback} />));
    const input = container.querySelector<HTMLInputElement>('input[aria-label="agent.message.feedbackPlaceholder"]');
    expect(input).not.toBeNull();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'Wrong club');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => input?.form?.requestSubmit());
    expect(onFeedback).toHaveBeenLastCalledWith('down', 'Wrong club');
  });

  it('mutation: optimistic flip on the cached message, reverted when the server refuses', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const message: AgentMessageDto = {
      id: 'a1',
      chatId: 'c1',
      seq: 2,
      role: 'ASSISTANT',
      blocks: [{ type: 'text', text: 'Hello' }],
      runId: 'r1',
      createdAt: '2026-10-04T10:00:00.000Z',
      feedback: null,
    };
    const detail = { id: 'c1', messages: [message], actions: [] } as unknown as AgentChatDetailDto;
    client.setQueryData(queryKeys.agent.chat('c1'), detail);
    const feedbackOf = () =>
      client.getQueryData<AgentChatDetailDto>(queryKeys.agent.chat('c1'))?.messages[0]?.feedback ?? null;

    let mutate: ReturnType<typeof useSetAgentMessageFeedbackMutation>['mutateAsync'] | null = null;
    function Probe() {
      mutate = useSetAgentMessageFeedbackMutation('c1').mutateAsync;
      return null;
    }
    act(() =>
      root.render(
        <QueryClientProvider client={client}>
          <Probe />
        </QueryClientProvider>,
      ),
    );

    let rejectCall: (err: unknown) => void = () => {};
    api.setMessageFeedback.mockReturnValueOnce(new Promise((_, reject) => (rejectCall = reject)));
    let pending: Promise<unknown> | null = null;
    act(() => {
      pending = mutate!({ messageId: 'a1', rating: 'up' }).catch(() => null);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(feedbackOf()).toBe('up');
    await act(async () => {
      rejectCall(new Error('500'));
      await pending;
    });
    expect(feedbackOf()).toBeNull();

    api.setMessageFeedback.mockResolvedValueOnce({ feedback: 'down' });
    await act(async () => {
      await mutate!({ messageId: 'a1', rating: 'down', comment: 'Wrong' });
    });
    expect(api.setMessageFeedback).toHaveBeenLastCalledWith('c1', 'a1', 'down', 'Wrong');
    expect(feedbackOf()).toBe('down');
  });
});

describe('limits', () => {
  it('retryAt: body, then Retry-After seconds, then the daily reset for the budget', () => {
    const now = Date.parse('2026-10-04T10:00:00.000Z');
    const err = (data: object, headers: object = {}) => ({ response: { data, headers } });
    expect(agentErrorRetryAt(err({ code: 'RATE_LIMITED', retryAt: '2026-10-04T10:05:00.000Z' }), { now })).toBe(
      '2026-10-04T10:05:00.000Z',
    );
    expect(agentErrorRetryAt(err({ code: 'RATE_LIMITED' }, { 'retry-after': '90' }), { now })).toBe(
      '2026-10-04T10:01:30.000Z',
    );
    expect(
      agentErrorRetryAt(err({ code: 'BUDGET_EXCEEDED' }), { now, dailyResetsAt: '2026-10-05T00:00:00.000Z' }),
    ).toBe('2026-10-05T00:00:00.000Z');
    expect(agentErrorRetryAt(err({ code: 'RATE_LIMITED' }), { now, dailyResetsAt: '2026-10-05T00:00:00.000Z' })).toBeNull();
  });

  it('card shows the reset time and a countdown in the last hour', () => {
    act(() =>
      root.render(
        <AgentLimitCard limit={{ code: 'BUDGET_EXCEEDED', retryAt: '2026-10-05T00:00:00.000Z' }} msLeft={65_000} />,
      ),
    );
    expect(container.textContent).toContain('agent.limits.budgetTitle');
    expect(container.textContent).toContain('agent.limits.budgetBody:{"time":"00:00"}');
    expect(container.textContent).toContain('agent.limits.countdown:{"duration":"1:05"}');

    act(() =>
      root.render(<AgentLimitCard limit={{ code: 'RATE_LIMITED', retryAt: null }} msLeft={0} />),
    );
    expect(container.textContent).toContain('agent.limits.rateBodyNoTime');
    expect(container.textContent).not.toContain('agent.limits.countdown');
  });

  it('pauses the composer until retryAt passes, then re-enables it by itself', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T10:00:00.000Z'));
    const retryAt = '2026-10-04T10:00:03.000Z';
    function Harness() {
      const clock = useAgentLimitClock(retryAt);
      return (
        <AgentComposer
          value="Hi"
          onChange={() => {}}
          onSend={() => {}}
          onStop={() => {}}
          onStartVoice={() => {}}
          running={false}
          pausedReason={clock.active ? 'Paused until 10:00' : null}
        />
      );
    }
    act(() => root.render(<Harness />));
    const textarea = () => container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea().disabled).toBe(true);
    expect(textarea().placeholder).toBe('Paused until 10:00');
    expect(byLabel('agent.composer.send')?.disabled).toBe(true);

    act(() => {
      vi.advanceTimersByTime(3_100);
    });
    expect(textarea().disabled).toBe(false);
    expect(textarea().placeholder).toBe('agent.composer.placeholder');
    expect(byLabel('agent.composer.send')?.disabled).toBe(false);
  });
});
