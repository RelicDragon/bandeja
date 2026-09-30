// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentPendingActionDto, AgentToolPermissionDto } from '@shared/agentContract';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({
  setPermission: vi.fn(),
  listPermissions: vi.fn(),
  resetPermissions: vi.fn(),
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/api/agent', () => ({ agentApi: api }));
vi.mock('@/store/authStore', () => ({
  useAuthStore: (select: (s: { user: { id: string } }) => unknown) => select({ user: { id: 'u1' } }),
}));
vi.mock('@/components/agent/AgentEntityCard', () => ({ AgentEntityList: () => null }));

import { AgentActionCard } from '@/components/agent/AgentActionCard';
import { agentActionButtons } from './agentActionButtons';
import { useSetAgentPermissionMutation } from '@/queries/agent/useAgentPermissions';
import { queryKeys } from '@/queries/queryKeys';

function action(over: Partial<AgentPendingActionDto> = {}): AgentPendingActionDto {
  return {
    id: 'a1',
    chatId: 'c1',
    runId: 'r1',
    toolName: 'join_game',
    status: 'PENDING',
    preview: { title: 'Join game', lines: [], warnings: [] },
    expiresAt: '2026-10-01T00:00:00.000Z',
    result: null,
    createdAt: '2026-09-30T00:00:00.000Z',
    autoApproved: false,
    riskTier: 'standard',
    canAlwaysAllow: true,
    execution: 'server',
    ...over,
  } as AgentPendingActionDto;
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

function buttonLabels(): string[] {
  return Array.from(container.querySelectorAll('button')).map((b) => b.textContent ?? '');
}

describe('agentActionButtons', () => {
  it('standard pending: Reject, Allow once, Always allow', () => {
    expect(agentActionButtons(action())).toEqual({
      reject: true,
      allowOnce: true,
      alwaysAllow: true,
      alwaysAsksHint: false,
    });
  });

  it('critical pending: no Always allow, "always asks" hint', () => {
    expect(agentActionButtons(action({ riskTier: 'critical', canAlwaysAllow: false }))).toEqual({
      reject: true,
      allowOnce: true,
      alwaysAllow: false,
      alwaysAsksHint: true,
    });
  });

  it('client-executed never offers Always allow', () => {
    expect(agentActionButtons(action({ execution: 'client' })).alwaysAllow).toBe(false);
  });

  it('auto-approved or settled: no buttons', () => {
    const none = { reject: false, allowOnce: false, alwaysAllow: false, alwaysAsksHint: false };
    expect(agentActionButtons(action({ autoApproved: true, status: 'EXECUTED' }))).toEqual(none);
    expect(agentActionButtons(action({ status: 'REJECTED' }))).toEqual(none);
  });
});

describe('AgentActionCard buttons', () => {
  const handlers = () => ({ onConfirm: vi.fn(), onReject: vi.fn(), onAlwaysAllow: vi.fn() });

  it('standard: three buttons; Always allow calls onAlwaysAllow', () => {
    const h = handlers();
    act(() => root.render(<AgentActionCard action={action()} busy={null} {...h} />));
    expect(buttonLabels()).toEqual(['agent.action.reject', 'agent.action.allowOnce', 'agent.action.alwaysAllow']);
    act(() => (container.querySelectorAll('button')[2] as HTMLButtonElement).click());
    expect(h.onAlwaysAllow).toHaveBeenCalledWith('a1');
    expect(h.onConfirm).not.toHaveBeenCalled();
  });

  it('critical: Reject + Allow once and the hint', () => {
    act(() =>
      root.render(
        <AgentActionCard action={action({ riskTier: 'critical', canAlwaysAllow: false })} busy={null} {...handlers()} />,
      ),
    );
    expect(buttonLabels()).toEqual(['agent.action.reject', 'agent.action.allowOnce']);
    expect(container.textContent).toContain('agent.action.alwaysAsks');
  });

  it('auto-approved: result, "done automatically" line and the permissions link', () => {
    act(() =>
      root.render(
        <AgentActionCard
          action={action({
            autoApproved: true,
            status: 'EXECUTED',
            result: { ok: true, message: 'Joined' },
          })}
          busy={null}
          {...handlers()}
        />,
      ),
    );
    expect(container.textContent).toContain('Joined');
    expect(container.textContent).toContain('agent.action.autoApproved');
    expect(container.textContent).toContain('agent.action.autoHeading');
    expect(buttonLabels()).toEqual(['agent.permissions.manage']);
  });
});

describe('useSetAgentPermissionMutation', () => {
  const tools: AgentToolPermissionDto[] = [
    {
      toolName: 'join_game',
      name: 'Join a game',
      description: 'Joins you to a game',
      riskTier: 'standard',
      mode: 'ASK',
      canAlwaysAllow: true,
    },
  ];

  it('flips optimistically and rolls back on error', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const key = queryKeys.agent.permissions('u1');
    client.setQueryData(key, tools);
    let fail: (err: Error) => void = () => {};
    api.setPermission.mockImplementation(() => new Promise((_, reject) => (fail = reject)));

    let mutate: ReturnType<typeof useSetAgentPermissionMutation>['mutate'] = () => {};
    function Harness() {
      mutate = useSetAgentPermissionMutation().mutate;
      return null;
    }
    act(() =>
      root.render(
        <QueryClientProvider client={client}>
          <Harness />
        </QueryClientProvider>,
      ),
    );

    await act(async () => {
      mutate({ toolName: 'join_game', mode: 'ALWAYS_ALLOW' });
    });
    expect(client.getQueryData<AgentToolPermissionDto[]>(key)?.[0].mode).toBe('ALWAYS_ALLOW');
    expect(api.setPermission).toHaveBeenCalledWith('join_game', 'ALWAYS_ALLOW');

    await act(async () => {
      fail(new Error('PERMISSION_NOT_ALLOWED'));
    });
    await vi.waitFor(() => expect(client.getQueryData<AgentToolPermissionDto[]>(key)?.[0].mode).toBe('ASK'));
  });
});
