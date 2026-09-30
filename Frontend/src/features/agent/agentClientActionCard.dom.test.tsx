// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentPendingActionDto } from '@shared/agentContract';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (s: { user: null }) => unknown) => selector({ user: null }),
}));
vi.mock('@/queries/agent/useAgentPermissions', () => ({ openAgentPermissionsScreen: () => {} }));
vi.mock('@/components/agent/AgentEntityCard', () => ({ AgentEntityList: () => null }));

const { AgentClientActionCard } = await import('@/components/agent/AgentClientActionCard');
const { useAgentClientExecStore } = await import('./agentClientExecStore');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const action = (over: Partial<AgentPendingActionDto> = {}): AgentPendingActionDto => ({
  id: 'a1',
  chatId: 'chat-1',
  runId: 'run-1',
  toolName: 'book_court',
  status: 'PENDING',
  preview: { title: 'Book court 2', lines: [], warnings: [] },
  expiresAt: '2026-10-01T10:15:00Z',
  result: null,
  createdAt: '2026-10-01T10:00:00Z',
  autoApproved: false,
  riskTier: 'critical',
  canAlwaysAllow: true,
  execution: 'client',
  ...over,
});

let container: HTMLDivElement;
let root: Root;
const onRun = vi.fn();
const onReject = vi.fn();

function render(a: AgentPendingActionDto) {
  act(() => {
    root.render(
      <MemoryRouter>
        <AgentClientActionCard action={a} rejecting={false} onReject={onReject} onRun={onRun} />
      </MemoryRouter>,
    );
  });
  return container.textContent ?? '';
}

const buttons = () => Array.from(container.querySelectorAll('button')).map((b) => b.textContent);

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  useAgentClientExecStore.setState({ byAction: {} });
  onRun.mockReset();
  onReject.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('AgentClientActionCard', () => {
  it('PENDING book: Reject + Book in app, never Always allow (even if canAlwaysAllow)', () => {
    render(action());
    expect(buttons()).toEqual(['agent.action.reject', 'agent.clientExec.bookInApp']);
    act(() => container.querySelectorAll('button')[1].click());
    expect(onRun).toHaveBeenCalledWith('a1');
  });

  it('PENDING cancel tool: Cancel in app', () => {
    render(action({ toolName: 'cancel_booking' }));
    expect(buttons()).toEqual(['agent.action.reject', 'agent.clientExec.cancelInApp']);
  });

  it('composite tools name both halves on the primary button', () => {
    render(action({ toolName: 'create_game_with_booking' }));
    expect(buttons()).toEqual(['agent.action.reject', 'agent.clientExec.bookAndCreateGameInApp']);
    render(action({ toolName: 'cancel_game' }));
    expect(buttons()).toEqual(['agent.action.reject', 'agent.clientExec.cancelBookingsAndGameInApp']);
  });

  it('saving step: per-tool wording', () => {
    act(() => useAgentClientExecStore.getState().set('a1', { stage: 'progress', progress: { kind: 'saving' } }));
    expect(render(action({ status: 'CONFIRMED', toolName: 'create_game_with_booking' }))).toContain(
      'agent.clientExec.savingCreateGame',
    );
    expect(render(action({ status: 'CONFIRMED', toolName: 'cancel_game' }))).toContain(
      'agent.clientExec.savingCancelGame',
    );
    expect(render(action({ status: 'CONFIRMED' }))).toContain('agent.clientExec.saving');
  });

  it('progress hides the buttons and shows the step', () => {
    act(() =>
      useAgentClientExecStore
        .getState()
        .set('a1', { stage: 'progress', progress: { kind: 'writing', index: 0, total: 2, operation: 'book' } }),
    );
    const text = render(action({ status: 'CONFIRMED' }));
    expect(buttons()).toEqual([]);
    expect(text).toContain('agent.clientExec.booking:{"current":1,"total":2}');
  });

  it('price step asks for one more tap', () => {
    act(() => useAgentClientExecStore.getState().set('a1', { stage: 'price', quote: { total: 50, currency: null } }));
    render(action({ status: 'CONFIRMED' }));
    expect(buttons()).toEqual(['agent.clientExec.priceStop', 'agent.clientExec.priceContinue:{"price":"50"}']);
  });

  it('UNKNOWN: outcome unknown + Club bookings link', () => {
    const text = render(action({ status: 'UNKNOWN', result: { ok: false, message: null } }));
    expect(text).toContain('agent.clientExec.unknown');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/profile/connected-clubs');
  });

  it('handled on another device', () => {
    act(() => useAgentClientExecStore.getState().set('a1', { stage: 'handled' }));
    const text = render(action({ status: 'CONFIRMED' }));
    expect(text).toContain('agent.clientExec.handledElsewhere');
    expect(buttons()).toEqual([]);
  });

  it('not connected: failed + Connected clubs hand-off', () => {
    act(() => useAgentClientExecStore.getState().set('a1', { stage: 'finished', notConnected: true, leaseExpired: false }));
    const text = render(action({ status: 'FAILED', result: { ok: false, message: 'Nothing changed' } }));
    expect(text).toContain('Nothing changed');
    expect(text).toContain('agent.clientExec.connectClub');
  });

  it('partial', () => {
    const text = render(action({ status: 'EXECUTED', result: { ok: true, partial: true, message: '1 of 2 courts booked' } }));
    expect(text).toContain('1 of 2 courts booked');
  });

  it('report pending on a CONFIRMED action: Try again only', () => {
    act(() => useAgentClientExecStore.getState().set('a1', { stage: 'report_pending' }));
    const text = render(action({ status: 'CONFIRMED' }));
    expect(text).toContain('agent.clientExec.reportPending');
    expect(buttons()).toEqual(['agent.clientExec.retry']);
  });
});
