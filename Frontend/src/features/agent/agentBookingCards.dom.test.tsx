// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentEntityRef } from '@shared/agentContract';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (s: { user: null }) => unknown) => selector({ user: null }),
}));

vi.mock('@/utils/displayPreferences', () => ({
  resolveDisplaySettings: () => ({ locale: 'en-GB', hour12: false, weekStart: 1 }),
}));

const { AgentEntityList } = await import('@/components/agent/AgentEntityCard');
const { AgentSendContext } = await import('./agentSendContext');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const slot = (over: Partial<Extract<AgentEntityRef, { type: 'slot' }>>): AgentEntityRef => ({
  type: 'slot',
  slotRef: 'r1',
  clubId: 'c1',
  clubName: 'X-Padel',
  courtNames: ['Court 1'],
  start: '2026-10-03T17:00:00.000Z',
  end: '2026-10-03T18:30:00.000Z',
  timeZone: 'Europe/Belgrade',
  confidence: 'live',
  asOf: null,
  ...over,
});

const booking = (over: Partial<Extract<AgentEntityRef, { type: 'booking' }>>): AgentEntityRef => ({
  type: 'booking',
  ref: 'bk_1',
  clubId: 'c1',
  clubName: 'X-Padel',
  courtNames: ['Yucatán'],
  start: '2026-10-03T17:00:00.000Z',
  end: '2026-10-03T18:30:00.000Z',
  timeZone: 'Europe/Belgrade',
  provider: 'BOOKTIME',
  state: 'CONFIRMED',
  linkedGameIds: ['g1'],
  canCancel: true,
  ...over,
});

describe('agent slot / booking cards (DOM)', () => {
  let container: HTMLDivElement;
  let root: Root;
  const send = vi.fn();

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    send.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (entities: AgentEntityRef[], disabled = false) =>
    act(() => {
      root.render(
        <MemoryRouter>
          <AgentSendContext.Provider value={{ send, disabled }}>
            <AgentEntityList entities={entities} />
          </AgentSendContext.Provider>
        </MemoryRouter>,
      );
    });

  const buttons = () => Array.from(container.querySelectorAll('button'));

  it('renders several slots as one picker grouped by club, with confidence badges', () => {
    render([
      slot({ slotRef: 'a', confidence: 'snapshot', asOf: '2026-10-03T12:05:00Z' }),
      slot({ slotRef: 'b', clubId: 'c2', clubName: 'Arena', confidence: 'app_only' }),
      slot({ slotRef: 'c', start: '2026-10-03T15:00:00Z', end: '2026-10-03T16:00:00Z' }),
    ]);
    const text = container.textContent ?? '';
    expect(text.indexOf('X-Padel')).toBeLessThan(text.indexOf('Arena'));
    expect(text.match(/X-Padel/g)).toHaveLength(1);
    expect(text).toContain('17:00–18:00');
    expect(text).toContain('agent.slot.confidence.live');
    expect(text).toContain('agent.slot.confidence.snapshot:{"time":"14:05"}');
    expect(text).toContain('agent.slot.confidence.appOnly');
    expect(text).not.toMatch(/free/i);
  });

  it('tapping a slot sends the message with a hidden slot token', () => {
    render([slot({})]);
    act(() => buttons()[0].click());
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatch(/^agent\.slot\.bookMessage:.*\[slot:r1\]$/);
  });

  it('slots are inert while the agent is busy', () => {
    render([slot({})], true);
    act(() => buttons()[0].click());
    expect(send).not.toHaveBeenCalled();
  });

  it('booking with canCancel shows Cancel and links games', () => {
    render([booking({})]);
    const cancel = buttons().find((b) => b.textContent === 'agent.booking.cancel');
    expect(cancel).toBeDefined();
    expect(container.textContent).toContain('agent.booking.linkedGame');
    expect(container.textContent).toContain('Booktime');
    act(() => cancel!.click());
    expect(send.mock.calls[0][0]).toMatch(/\[booking:bk_1\]$/);
  });

  it('booking without canCancel points at the club', () => {
    render([booking({ provider: 'WELTNER', canCancel: false, linkedGameIds: [] })]);
    expect(buttons().some((b) => b.textContent === 'agent.booking.cancel')).toBe(false);
    expect(container.textContent).toContain('agent.booking.cancelViaClub');
    expect(container.textContent).toContain('agent.booking.openClub');
  });
});
