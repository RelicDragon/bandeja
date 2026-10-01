// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentMemoryDto, AgentMemoryOverviewDto, AgentMessageDto } from '@shared/agentContract';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({
  getMemory: vi.fn(),
  setMemoryEnabled: vi.fn(),
  addMemory: vi.fn(),
  updateMemory: vi.fn(),
  deleteMemory: vi.fn(),
  clearMemory: vi.fn(),
  listPermissions: vi.fn(),
}));
const toastApi = vi.hoisted(() => ({ custom: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key) }),
}));
vi.mock('react-hot-toast', () => ({ default: toastApi }));
vi.mock('@/api/agent', () => ({ agentApi: api }));
vi.mock('@/store/authStore', () => ({
  useAuthStore: (select: (s: { user: { id: string } }) => unknown) => select({ user: { id: 'u1' } }),
}));
vi.mock('@/utils/extractApiErrorMessage', () => ({ extractApiErrorMessage: () => 'error' }));
vi.mock('@/components/ConfirmationModal', () => ({ ConfirmationModal: () => null }));
vi.mock('@/hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => true }));

import { AgentMemoryTab } from '@/components/agent/AgentMemoryTab';
import { AgentMemorySavedChip } from '@/components/agent/AgentMemorySavedChip';
import {
  memoryRestoreOf,
  useDeleteAgentMemoryMutation,
  useSetAgentMemoryEnabledMutation,
} from '@/queries/agent/useAgentMemory';
import { openAgentPermissionsScreen, useAgentPermissionsScreenStore } from '@/queries/agent/useAgentPermissions';
import { queryKeys } from '@/queries/queryKeys';
import { agentRunReducer, createRunState } from './agentRunReducer';
import { buildAgentTimeline } from './agentTimeline';

function memory(over: Partial<AgentMemoryDto> = {}): AgentMemoryDto {
  return {
    id: 'm1',
    name: 'evening_games',
    description: 'Prefers evening games',
    body: 'Prefers evening games after 19:00.',
    type: 'PREFERENCE',
    source: 'MODEL_INFERRED',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    lastUsedAt: null,
    ...over,
  };
}

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
const key = queryKeys.agent.memory('u1');

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

function render(node: React.ReactNode) {
  act(() => root.render(<QueryClientProvider client={client}>{node}</QueryClientProvider>));
}

function button(text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent?.includes(text) || b.getAttribute('aria-label') === text,
  );
  if (!found) throw new Error(`no button ${text}: ${container.innerHTML}`);
  return found as HTMLButtonElement;
}

describe('memory.saved in the run', () => {
  it('lands on its tool call and survives the message save', () => {
    let state = createRunState('r1', 'c1');
    state = agentRunReducer(state, { type: 'event', eventId: '1', event: { type: 'tool.started', callId: 'call1', name: 'save_memory', label: 'Saving' } });
    state = agentRunReducer(state, { type: 'event', eventId: '2', event: { type: 'tool.finished', callId: 'call1', ok: true, summary: 'Saved' } });
    state = agentRunReducer(state, {
      type: 'event',
      eventId: '3',
      event: { type: 'memory.saved', callId: 'call1', memory: { id: 'm1', name: 'n', description: 'd', created: true } },
    });
    const saved: AgentMessageDto = {
      id: 'msg',
      chatId: 'c1',
      seq: 2,
      role: 'TOOL',
      blocks: [{ type: 'tool_result', callId: 'call1', ok: true, summary: 'Saved' }],
      createdAt: '2026-10-01T00:00:00.000Z',
    } as AgentMessageDto;
    state = agentRunReducer(state, { type: 'event', eventId: '4', event: { type: 'message.saved', message: saved } });
    const call: AgentMessageDto = { ...saved, id: 'call', seq: 1, role: 'ASSISTANT', blocks: [{ type: 'tool_call', callId: 'call1', name: 'save_memory', label: 'Saving' }] } as AgentMessageDto;
    const items = buildAgentTimeline([call, saved], [], state);
    const tool = items.find((i) => i.kind === 'tool');
    expect(tool && tool.kind === 'tool' ? tool.tool.memorySaved : null).toEqual({ id: 'm1', name: 'n', description: 'd', created: true });
  });
});

describe('openAgentPermissionsScreen', () => {
  it('opens on the requested tab, Permissions by default', () => {
    openAgentPermissionsScreen('memory');
    expect(useAgentPermissionsScreenStore.getState()).toMatchObject({ open: true, tab: 'memory' });
    openAgentPermissionsScreen();
    expect(useAgentPermissionsScreenStore.getState().tab).toBe('permissions');
  });
});

describe('memory mutations', () => {
  it('delete is optimistic and rolls back on error', async () => {
    client.setQueryData<AgentMemoryOverviewDto>(key, { enabled: true, items: [memory()] });
    let fail: (err: Error) => void = () => {};
    api.deleteMemory.mockImplementation(() => new Promise((_, reject) => (fail = reject)));
    let mutate: ReturnType<typeof useDeleteAgentMemoryMutation>['mutate'] = () => {};
    function Harness() {
      mutate = useDeleteAgentMemoryMutation().mutate;
      return null;
    }
    render(<Harness />);
    await act(async () => mutate('m1'));
    expect(client.getQueryData<AgentMemoryOverviewDto>(key)?.items).toEqual([]);
    await act(async () => fail(new Error('boom')));
    await vi.waitFor(() => expect(client.getQueryData<AgentMemoryOverviewDto>(key)?.items).toHaveLength(1));
  });

  it('the switch flips at once and rolls back', async () => {
    client.setQueryData<AgentMemoryOverviewDto>(key, { enabled: true, items: [] });
    let fail: (err: Error) => void = () => {};
    api.setMemoryEnabled.mockImplementation(() => new Promise((_, reject) => (fail = reject)));
    let mutate: ReturnType<typeof useSetAgentMemoryEnabledMutation>['mutate'] = () => {};
    function Harness() {
      mutate = useSetAgentMemoryEnabledMutation().mutate;
      return null;
    }
    render(<Harness />);
    await act(async () => mutate(false));
    expect(client.getQueryData<AgentMemoryOverviewDto>(key)?.enabled).toBe(false);
    await act(async () => fail(new Error('boom')));
    await vi.waitFor(() => expect(client.getQueryData<AgentMemoryOverviewDto>(key)?.enabled).toBe(true));
  });

  it('Undo restores the item with its own fields', () => {
    expect(memoryRestoreOf(memory())).toEqual({
      text: 'Prefers evening games after 19:00.',
      restore: { name: 'evening_games', description: 'Prefers evening games', type: 'PREFERENCE', source: 'MODEL_INFERRED' },
    });
  });
});

describe('AgentMemoryTab', () => {
  it('empty state: switch, disclosure, two examples, Remove all disabled', async () => {
    api.getMemory.mockResolvedValue({ enabled: true, items: [] });
    render(<AgentMemoryTab active />);
    await vi.waitFor(() => expect(container.querySelector('[data-testid="agent-memory-empty"]')).not.toBeNull());
    expect(container.textContent).toContain('agent.memory.disclosure');
    expect(container.textContent).toContain('agent.memory.example1');
    expect(container.textContent).toContain('agent.memory.example2');
    expect(button('agent.memory.removeAll').disabled).toBe(true);
    expect(button('agent.memory.add').disabled).toBe(false);
  });

  it('OFF: dimmed list, add and edit disabled, delete allowed with an Undo toast', async () => {
    api.getMemory.mockResolvedValue({ enabled: false, items: [memory(), memory({ id: 'm2', source: 'USER_ASKED', description: 'Left side', body: 'Left side' })] });
    api.deleteMemory.mockResolvedValue(undefined);
    render(<AgentMemoryTab active />);
    await vi.waitFor(() => expect(container.querySelector('[data-testid="agent-memory-item-m1"]')).not.toBeNull());
    expect(container.textContent).toContain('agent.memory.offNote');
    expect(container.textContent).toContain('agent.memory.badgeLearned');
    expect(container.textContent).toContain('agent.memory.badgeUser');
    expect(button('agent.memory.add').disabled).toBe(true);
    expect(button('agent.memory.edit').disabled).toBe(true);
    await act(async () => button('agent.memory.delete').click());
    expect(api.deleteMemory).toHaveBeenCalledWith('m1');
    await vi.waitFor(() => expect(toastApi.custom).toHaveBeenCalled());
    await vi.waitFor(() => expect(container.querySelector('[data-testid="agent-memory-item-m1"]')).toBeNull());
  });

  it('adds a note from the form', async () => {
    api.getMemory.mockResolvedValue({ enabled: true, items: [] });
    api.addMemory.mockResolvedValue(memory({ id: 'm9', source: 'USER_ASKED', description: 'I play on Sundays', body: 'I play on Sundays' }));
    render(<AgentMemoryTab active />);
    await vi.waitFor(() => expect(button('agent.memory.add').disabled).toBe(false));
    await act(async () => button('agent.memory.add').click());
    await vi.waitFor(() => expect(container.querySelector('textarea')).not.toBeNull());
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.maxLength).toBe(500);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(textarea, 'I play on Sundays');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button('agent.memory.save').click());
    expect(api.addMemory).toHaveBeenCalledWith('I play on Sundays', undefined);
    await vi.waitFor(() => expect(container.querySelector('[data-testid="agent-memory-item-m9"]')).not.toBeNull());
  });
});

describe('AgentMemorySavedChip', () => {
  it('new note: Undo deletes it', async () => {
    api.deleteMemory.mockResolvedValue(undefined);
    render(<AgentMemorySavedChip memory={{ id: 'm1', name: 'n', description: 'd', created: true }} />);
    expect(container.textContent).toContain('agent.memory.savedChip');
    await act(async () => button('agent.memory.undo').click());
    expect(api.deleteMemory).toHaveBeenCalledWith('m1');
    await vi.waitFor(() => expect(container.textContent).toContain('agent.memory.undoneChip'));
  });

  it('updated note: no Undo, the label opens the Memory tab', () => {
    useAgentPermissionsScreenStore.setState({ open: false, tab: 'permissions' });
    render(<AgentMemorySavedChip memory={{ id: 'm1', name: 'n', description: 'd', created: false }} />);
    expect(container.textContent).toContain('agent.memory.updatedChip');
    expect(container.textContent).not.toContain('agent.memory.undo');
    act(() => button('agent.memory.openMemory').click());
    expect(useAgentPermissionsScreenStore.getState()).toMatchObject({ open: true, tab: 'memory' });
  });
});
