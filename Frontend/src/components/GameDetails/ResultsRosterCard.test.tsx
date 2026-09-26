// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game } from '@/types';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('@/components/ui/Dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

// Mirrors the real avatar: a button unless `asDiv`, so nested-button regressions show up.
vi.mock('@/components', () => ({
  PlayerAvatar: ({ asDiv }: { asDiv?: boolean }) => (asDiv ? <span /> : <button type="button" />),
}));

vi.mock('@/api', () => ({
  gamesApi: { substituteParticipant: vi.fn() },
}));

vi.mock('@/api/users', () => ({
  usersApi: {
    getInvitablePlayers: vi.fn().mockResolvedValue({
      data: { players: [{ id: 'bench', firstName: 'Bench', lastName: 'Player' }] },
    }),
  },
}));

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import { ResultsRosterCard } from './ResultsRosterCard';

function participant(userId: string, firstName: string, status = 'PLAYING') {
  return {
    id: `gp-${userId}`,
    userId,
    gameId: 'game-1',
    status,
    role: 'PARTICIPANT',
    user: { id: userId, firstName, lastName: 'Test' },
  };
}

const game = {
  id: 'game-1',
  entityType: 'GAME',
  status: 'STARTED',
  resultsStatus: 'IN_PROGRESS',
  trainerId: 'coach',
  participants: [
    participant('anna', 'Anna'),
    participant('max', 'Max'),
    participant('coach', 'Coach', 'NON_PLAYING'),
  ],
} as unknown as Game;

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

function render(props: Partial<{ game: Game; canEdit: boolean }> = {}) {
  act(() => {
    root.render(
      <ResultsRosterCard game={props.game ?? game} canEdit={props.canEdit ?? true} onGameUpdate={vi.fn()} />,
    );
  });
}

function click(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes(label),
  );
  if (!button) throw new Error(`No button labelled "${label}"`);
  act(() => button.click());
}

describe('ResultsRosterCard', () => {
  it('shows one compact row and keeps the roster off the page until opened', () => {
    render();

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.textContent).toContain('gameDetails.substitutePlayerTitle');
    expect(container.textContent).toContain('gameDetails.substitutePlayerCardHint');
    expect(container.textContent).not.toContain('Anna');
    expect(container.querySelector('[data-testid="dialog"]')).toBeNull();
  });

  it('walks out-player → replacement, and Change goes back to the out step', async () => {
    render();
    click('gameDetails.substitutePlayerTitle');

    expect(container.textContent).toContain('gameDetails.substitutePlayerPickOut');
    expect(container.textContent).toContain('Anna Test');
    expect(container.textContent).toContain('Max Test');
    expect(container.textContent).not.toContain('Coach');
    expect(container.querySelector('button button')).toBeNull();

    click('Anna Test');
    await act(async () => {});
    expect(container.querySelector('button button')).toBeNull();

    expect(container.textContent).toContain('gameDetails.substitutePlayerReplacing');
    expect(container.textContent).toContain('Bench Player');
    expect(container.textContent).not.toContain('gameDetails.substitutePlayerPickOut');

    click('common.change');
    expect(container.textContent).toContain('gameDetails.substitutePlayerPickOut');
  });

  it('is hidden for non-owners and outside results entry', () => {
    render({ canEdit: false });
    expect(container.textContent).toBe('');

    render({ game: { ...game, resultsStatus: 'FINAL' } as Game });
    expect(container.textContent).toBe('');
  });
});
