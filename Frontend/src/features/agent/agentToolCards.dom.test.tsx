// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AgentPendingActionDto,
  AgentPlayIntentCard,
  AgentResultsCard,
  AgentWeatherCard,
} from '@shared/agentContract';

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
vi.mock('@/hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => true }));
vi.mock('@/queries/agent/useAgentPermissions', () => ({ openAgentPermissionsScreen: () => {} }));
const haptics = vi.hoisted(() => ({ hapticSelection: vi.fn(), hapticSuccess: vi.fn(), hapticError: vi.fn() }));
vi.mock('@/utils/haptics', () => haptics);

const { AgentToolCard } = await import('@/components/agent/AgentToolCard');
const { AgentActionCard } = await import('@/components/agent/AgentActionCard');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const results: AgentResultsCard = {
  kind: 'results',
  gameId: 'g1',
  title: 'Friday padel',
  resultsStatus: 'FINAL',
  matchCount: 8,
  matches: [
    {
      round: 1,
      match: 1,
      teamA: [{ name: 'Ana', you: true }, { name: 'Bo' }],
      teamB: [{ name: 'Cy' }, { name: 'Di' }],
      sets: [{ teamA: 6, teamB: 4 }, { teamA: 6, teamB: 3 }],
      winner: 'teamA',
    },
  ],
  standings: [{ position: 1, name: 'Ana', you: true, isWinner: true, wins: 3, ties: 0, losses: 1 }],
};

const intent: AgentPlayIntentCard = {
  kind: 'play_intent',
  status: 'OPEN',
  cityName: 'Belgrade',
  lookingFor: 'Padel game',
  chips: [
    { kind: 'days', label: 'Tomorrow' },
    { kind: 'time', label: '19:00–24:00' },
    { kind: 'level', label: '2–4' },
  ],
  matchingGameCount: 3,
  proposal: null,
};

const weather: AgentWeatherCard = {
  kind: 'weather',
  place: 'Belgrade',
  gameId: 'g9',
  gameTitle: 'Evening game',
  date: '2026-10-04',
  window: { start: '18:00', end: '19:30' },
  source: 'forecast',
  stale: false,
  outdoor: true,
  verdict: 'risky',
  bestWindow: null,
  hours: [
    { time: '18:00', tempC: 19, condition: 'rain', isDay: true, rainChancePct: 70, rainMm: 0.6, windKmh: 12, playable: false },
    { time: '19:00', tempC: 18, condition: 'cloudy', isDay: false, rainChancePct: 10, rainMm: 0, windKmh: 10, playable: true },
  ],
};

const action = (over: Partial<AgentPendingActionDto> = {}): AgentPendingActionDto => ({
  id: 'a1',
  chatId: 'chat',
  runId: 'r1',
  toolName: 'update_game',
  status: 'PENDING',
  preview: {
    title: 'Change the game',
    lines: [
      { label: 'Start', from: 'Sat 18:00', to: 'Sat 19:00' },
      { label: 'Club', from: null, to: 'X-Padel' },
    ],
    warnings: [],
  },
  expiresAt: '2026-10-03T12:00:00.000Z',
  result: null,
  createdAt: '2026-10-03T11:00:00.000Z',
  autoApproved: false,
  riskTier: 'standard',
  canAlwaysAllow: true,
  execution: 'server',
  ...over,
});

let container: HTMLDivElement;
let root: Root;

function render(node: React.ReactNode) {
  act(() => root.render(<MemoryRouter>{node}</MemoryRouter>));
  return container.textContent ?? '';
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('rich tool cards', () => {
  it('results: status, teams with "you", set scores, podium and the rest of the matches', () => {
    const text = render(<AgentToolCard card={results} />);
    expect(text).toContain('Friday padel');
    expect(text).toContain('agent.cards.results.status.FINAL');
    expect(text).toContain('agent.cards.results.you:{"name":"Ana"}');
    expect(text).toContain('Cy');
    expect(text).toContain('agent.cards.results.more:{"count":7}');
    expect(container.querySelector('[aria-label="agent.cards.results.winner"]')).not.toBeNull();
    expect(container.querySelector('button'), 'the header opens the game').not.toBeNull();
  });

  it('results inside a confirmation card does not navigate', () => {
    render(<AgentToolCard card={results} linkable={false} />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('play intent: chips and the match count', () => {
    const text = render(<AgentToolCard card={intent} />);
    expect(text).toContain('Padel game');
    expect(text).toContain('agent.cards.playIntent.open');
    expect(text).toContain('19:00–24:00');
    expect(text).toContain('agent.cards.playIntent.gamesFit:{"count":3}');
    expect(container.querySelectorAll('li')).toHaveLength(3);
  });

  it('weather: verdict, window, hours with rain and wind', () => {
    const text = render(<AgentToolCard card={weather} />);
    expect(text).toContain('Evening game');
    expect(text).toContain('agent.cards.weather.verdict.risky');
    expect(text).toContain('18:00–19:30');
    expect(text).toContain('70%');
    expect(text).toContain('19°');
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });
});

describe('AgentActionCard', () => {
  it('renders changes as before → after and taps Confirm with a haptic', () => {
    const onConfirm = vi.fn();
    render(<AgentActionCard action={action()} busy={null} onConfirm={onConfirm} onReject={() => {}} />);
    const struck = container.querySelector('.line-through');
    expect(struck?.textContent).toBe('Sat 18:00');
    expect(container.textContent).toContain('Sat 19:00');
    expect(container.textContent).toContain('X-Padel');
    const confirm = [...container.querySelectorAll('button')].find((b) => b.textContent === 'agent.action.allowOnce')!;
    act(() => confirm.click());
    expect(haptics.hapticSelection).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('a1');
  });

  it('executing shows progress; the outcome gives a success haptic and the compact result line', async () => {
    const props = { onConfirm: () => {}, onReject: () => {} };
    render(<AgentActionCard action={action()} busy="confirm" {...props} />);
    expect(container.textContent).toContain('agent.action.applying');
    render(<AgentActionCard action={action({ status: 'EXECUTED', result: { ok: true, message: 'Moved to 19:00' } })} busy={null} {...props} />);
    expect(haptics.hapticSuccess).toHaveBeenCalledTimes(1);
    // The buttons collapse first (AnimatePresence "wait"), then the result line comes in.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(container.textContent).toContain('Moved to 19:00');
    expect(container.textContent).not.toContain('agent.action.allowOnce');
  });

  it('a failure gives an error haptic; a card that arrives settled stays silent', () => {
    const props = { onConfirm: () => {}, onReject: () => {} };
    render(<AgentActionCard action={action()} busy="confirm" {...props} />);
    render(<AgentActionCard action={action({ status: 'FAILED', result: { ok: false, message: 'Nope' } })} busy={null} {...props} />);
    expect(haptics.hapticError).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    root = createRoot(container);
    render(<AgentActionCard action={action({ status: 'EXECUTED', autoApproved: true, result: { ok: true, message: 'Done' } })} busy={null} {...props} />);
    expect(haptics.hapticSuccess).not.toHaveBeenCalled();
  });

  it('a preview card replaces the lines when it carries them', () => {
    const preview = { title: 'Save score', lines: [{ label: 'Score', from: null, to: '6-4 6-3' }], warnings: [], card: { ...results, resultsStatus: 'IN_PROGRESS' as const, matchCount: 1, standings: undefined }, linesInCard: true };
    const text = render(<AgentActionCard action={action({ toolName: 'enter_match_score', preview })} busy={null} onConfirm={() => {}} onReject={() => {}} />);
    expect(text).toContain('agent.cards.results.status.IN_PROGRESS');
    expect(text).not.toContain('6-4 6-3');
  });
});
