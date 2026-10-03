// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentChatUsageDto } from '@shared/agentContract';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
    i18n: { language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const { AgentContextHint, AgentContextMeterButton } = await import('@/components/agent/AgentContextMeter');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const usage = (contextTokens: number): AgentChatUsageDto => ({
  contextTokens,
  contextWindowTokens: 100_000,
  dailyUsedTokens: 300_000,
  dailyBudgetTokens: 1_500_000,
  dailyResetsAt: '2026-10-04T00:00:00.000Z',
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('AgentContextMeter', () => {
  it('colors the donut by level and labels the percentage', () => {
    const onClick = vi.fn();
    act(() => root.render(<AgentContextMeterButton usage={usage(80_000)} onClick={onClick} />));
    const button = container.querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('agent.context.meterLabel:{"percent":80}');
    expect(container.querySelector('circle.text-red-500')).not.toBeNull();
    act(() => button.click());
    expect(onClick).toHaveBeenCalledOnce();

    act(() => root.render(<AgentContextMeterButton usage={usage(55_000)} onClick={onClick} />));
    expect(container.querySelector('circle.text-amber-500')).not.toBeNull();
  });

  it('meter: hidden until the chat has used context', () => {
    act(() => root.render(<AgentContextMeterButton usage={usage(0)} onClick={() => {}} />));
    expect(container.querySelector('button')).toBeNull();
    act(() => root.render(<AgentContextMeterButton usage={undefined} onClick={() => {}} />));
    expect(container.querySelector('button')).toBeNull();
    act(() => root.render(<AgentContextMeterButton usage={usage(1_000)} onClick={() => {}} />));
    expect(container.querySelector('button')).not.toBeNull();
  });

  it('hint: hidden below 50%, warn at 50%, critical at 75%, never dismissible', () => {
    const onNewChat = vi.fn();
    act(() => root.render(<AgentContextHint usage={usage(49_000)} onNewChat={onNewChat} creating={false} />));
    expect(container.textContent).toBe('');

    act(() => root.render(<AgentContextHint usage={usage(50_000)} onNewChat={onNewChat} creating={false} />));
    expect(container.textContent).toContain('agent.context.hintWarn');
    // Only one control: start a new chat (no close button).
    expect(container.querySelectorAll('button')).toHaveLength(1);
    act(() => container.querySelector('button')!.click());
    expect(onNewChat).toHaveBeenCalledOnce();

    act(() => root.render(<AgentContextHint usage={usage(75_000)} onNewChat={onNewChat} creating={false} />));
    expect(container.textContent).toContain('agent.context.hintCritical');
  });
});
