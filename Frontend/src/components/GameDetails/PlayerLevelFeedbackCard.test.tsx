// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameLevelEvaluations } from '@/api/results';

const api = vi.hoisted(() => ({
  getLevelEvaluations: vi.fn(),
  upsertLevelEvaluation: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock('@/api/results', () => ({
  resultsApi: {
    getLevelEvaluations: api.getLevelEvaluations,
    upsertLevelEvaluation: api.upsertLevelEvaluation,
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: api.invalidateQueries }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));
vi.mock('@/hooks/useBackButtonModal', () => ({ useBackButtonModal: vi.fn() }));
vi.mock('@/services/player-level-feedback-metrics', () => ({
  recordPlayerLevelFeedbackMetric: vi.fn(),
}));

vi.mock('framer-motion', async () => {
  const ReactModule = await vi.importActual<typeof import('react')>('react');
  const element = (tag: 'div' | 'section') => ReactModule.forwardRef<HTMLElement, Record<string, unknown>>(
    ({ children, initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }, ref) =>
      ReactModule.createElement(tag, { ...props, ref }, children as React.ReactNode),
  );
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: { div: element('div'), section: element('section') },
  };
});

vi.mock('@/components/ui/Drawer', () => ({
  Drawer: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerCloseButton: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props} />
  ),
  DrawerDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DrawerHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

import { PlayerLevelFeedbackCard } from './PlayerLevelFeedbackCard';

const response: GameLevelEvaluations = {
  sport: 'PADEL',
  canEdit: true,
  editableUntil: new Date(Date.now() + 60_000).toISOString(),
  completedCount: 0,
  players: [
    { id: 'A', name: 'Alpha' },
    { id: 'B', name: 'Bravo' },
    { id: 'C', name: 'Charlie' },
  ].map(({ id, name }) => ({
    user: { id, firstName: name },
    levelSnapshot: 3,
    verdict: null,
    updatedAt: null,
  })),
};

function buttonWithText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')]
    .find((candidate) => candidate.textContent?.includes(text));
  if (!button) throw new Error(`button not found: ${text}`);
  return button;
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
}

describe('PlayerLevelFeedbackCard', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    api.getLevelEvaluations.mockResolvedValue({ data: structuredClone(response) });
    api.upsertLevelEvaluation.mockResolvedValue({ data: {} });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<PlayerLevelFeedbackCard gameId="game-1" />);
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it('returns to an earlier skipped player before showing Thanks', async () => {
    await click(buttonWithText(container, 'gameResults.levelFeedback.cardTitle'));
    expect(container.textContent).toContain('Alpha');

    await click(buttonWithText(container, 'gameResults.levelFeedback.verdict.HIGHER'));
    expect(container.textContent).toContain('Bravo');

    await click(buttonWithText(container, 'gameResults.levelFeedback.skip'));
    expect(container.textContent).toContain('Charlie');

    await click(buttonWithText(container, 'gameResults.levelFeedback.verdict.LOWER'));
    expect(container.textContent).toContain('Bravo');
    expect(container.textContent).not.toContain('gameResults.levelFeedback.thanksTitle');
    expect(api.upsertLevelEvaluation).toHaveBeenCalledTimes(2);
  });
});
