// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentToolItemData } from './agentTimeline';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('@/components/agent/AgentEntityCard', () => ({ AgentEntityList: () => null }));
vi.mock('@/components/agent/AgentMemorySavedChip', () => ({ AgentMemorySavedChip: () => null }));

const { AgentToolGroup } = await import('@/components/agent/AgentToolGroup');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tool = (callId: string, over: Partial<AgentToolItemData> = {}): AgentToolItemData => ({
  callId,
  label: `Looking up ${callId}`,
  status: 'ok',
  summary: `Found ${callId}`,
  entities: [],
  ...over,
});

let container: HTMLDivElement;
let root: Root;

function render(tools: AgentToolItemData[]) {
  act(() => root.render(<AgentToolGroup tools={tools} />));
  return container.textContent ?? '';
}

const header = () => container.querySelector('button') as HTMLButtonElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('AgentToolGroup', () => {
  it('shows the running step label while working', () => {
    const text = render([tool('a'), tool('b', { status: 'running', summary: null })]);
    expect(text).toContain('Looking up b');
    expect(text).not.toContain('Found a');
  });

  it('collapses finished steps into a count and expands to list them', () => {
    expect(render([tool('a'), tool('b')])).toContain('agent.tool.steps:{"n":2}');
    expect(header().getAttribute('aria-expanded')).toBe('false');
    act(() => header().click());
    expect(header().getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Found a');
    expect(container.textContent).toContain('Found b');
  });

  it('counts failed steps', () => {
    expect(render([tool('a'), tool('b', { status: 'error' })])).toContain('agent.tool.stepsFailed:{"n":2,"failed":1}');
  });

  it('a single finished step shows its summary', () => {
    expect(render([tool('a')])).toContain('Found a');
  });
});
