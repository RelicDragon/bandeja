// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentMessageDto, AgentPendingActionDto } from '@shared/agentContract';
import type { AgentPersonalPrompt } from './agentPersonalPrompts';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
    i18n: { language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const haptic = vi.fn();
vi.mock('@/utils/haptics', () => ({ hapticSelection: () => haptic() }));

const personal: { prompts: AgentPersonalPrompt[]; loading: boolean } = { prompts: [], loading: false };
vi.mock('@/features/agent/useAgentPersonalPrompts', () => ({ useAgentPersonalPrompts: () => personal }));

const { AgentFollowUpChips } = await import('@/components/agent/AgentFollowUpChips');
const { AgentSuggestedPrompts } = await import('@/components/agent/AgentSuggestedPrompts');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  haptic.mockReset();
  personal.prompts = [];
  personal.loading = false;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const messages: AgentMessageDto[] = [
  { id: 'u', chatId: 'c', seq: 1, role: 'USER', blocks: [{ type: 'text', text: 'free courts?' }], runId: null, createdAt: '' },
  {
    id: 'a',
    chatId: 'c',
    seq: 2,
    role: 'ASSISTANT',
    runId: 'r',
    createdAt: '',
    blocks: [
      { type: 'tool_call', callId: 'c1', name: 'find_available_slots', label: 'Slots' },
      {
        type: 'tool_result',
        callId: 'c1',
        ok: true,
        summary: '1 slot',
        entities: [
          {
            type: 'slot',
            slotRef: 's',
            clubId: 'k',
            clubName: 'Club',
            courtNames: ['1'],
            start: '2026-10-04T17:00:00.000Z',
            end: '2026-10-04T18:00:00.000Z',
            timeZone: 'UTC',
            confidence: 'live',
            asOf: null,
          },
        ],
      },
      { type: 'text', text: 'One court is free.' },
    ],
  },
];

describe('AgentFollowUpChips', () => {
  it('renders 44px chips and sends the tapped one with a light haptic', () => {
    const onPick = vi.fn();
    act(() => root.render(<AgentFollowUpChips messages={messages} actions={[]} hidden={false} onPick={onPick} />));
    const buttons = [...container.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['agent.followUps.bookFirstSlot', 'agent.followUps.laterSlots']);
    expect(buttons[0].className).toContain('min-h-[44px]');
    act(() => buttons[0].click());
    expect(haptic).toHaveBeenCalledOnce();
    expect(onPick).toHaveBeenCalledWith('agent.followUps.bookFirstSlot');
  });

  it('renders nothing when hidden or while a write card is pending', () => {
    act(() => root.render(<AgentFollowUpChips messages={messages} actions={[]} hidden onPick={() => {}} />));
    expect(container.querySelector('button')).toBeNull();
    const pending = {
      id: 'x',
      runId: 'r',
      toolName: 'book_court',
      status: 'PENDING',
    } as AgentPendingActionDto;
    act(() =>
      root.render(
        <AgentFollowUpChips
          messages={[...messages.slice(0, 1), { ...messages[1], blocks: [...messages[1].blocks, { type: 'action', actionId: 'x' }] }]}
          actions={[pending]}
          hidden={false}
          onPick={() => {}}
        />,
      ),
    );
    expect(container.querySelector('button')).toBeNull();
  });
});

describe('AgentSuggestedPrompts', () => {
  it('shows a skeleton while loading', () => {
    personal.loading = true;
    act(() => root.render(<AgentSuggestedPrompts onPick={() => {}} />));
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });

  it('falls back to the four generic examples', () => {
    act(() => root.render(<AgentSuggestedPrompts onPick={() => {}} />));
    expect([...container.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      'agent.examples.nextGames',
      'agent.examples.findGame',
      'agent.examples.moveGame',
      'agent.examples.league',
    ]);
  });

  it('puts personalized cards first with a context line, topped up to four', () => {
    personal.prompts = [
      {
        id: 'needsPlayers:g',
        kind: 'needsPlayers',
        gameId: 'g',
        vars: { when: 'Thu 19:00', playing: 3, max: 4 },
        place: 'Club A',
      },
    ];
    const onPick = vi.fn();
    act(() => root.render(<AgentSuggestedPrompts onPick={onPick} />));
    const buttons = [...container.querySelectorAll('button')];
    expect(buttons).toHaveLength(4);
    expect(buttons[0].textContent).toContain('agent.personal.needsPlayers.prompt');
    expect(buttons[0].textContent).toContain('agent.personal.needsPlayers.context:{"when":"Thu 19:00","playing":3,"max":4} · Club A');
    expect(buttons[3].textContent).toBe('agent.examples.moveGame');
    act(() => buttons[0].click());
    expect(onPick).toHaveBeenCalledWith('agent.personal.needsPlayers.prompt:{"when":"Thu 19:00","playing":3,"max":4}');
  });
});
