// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameParticipant } from '@/types';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

vi.mock('@/components/ui/Dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('../PlayerAvatar', () => ({
  PlayerAvatar: () => <div data-testid="avatar" />,
}));

vi.mock('@/components/PremiumName', () => ({
  PremiumName: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/contexts/SportLevelContext', () => ({
  SportLevelProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: { user: { id: string } }) => unknown) =>
    selector({ user: { id: 'me' } }),
}));

import { TeamPlayerSelector } from './TeamPlayerSelector';

function participant(id: string, firstName: string): GameParticipant {
  return {
    userId: id,
    role: 'PLAYER',
    status: 'PLAYING',
    joinedAt: '2026-01-01T00:00:00.000Z',
    user: { id, firstName, lastName: 'Player' },
  } as GameParticipant;
}

let container: HTMLDivElement;
let root: Root;

function render(ui: React.ReactElement) {
  act(() => {
    root.render(ui);
  });
}

function rows(): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[role="button"]')];
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('TeamPlayerSelector', () => {
  it('picks a player on tap and skips the search field for a short roster', () => {
    const onConfirm = vi.fn();
    render(
      <TeamPlayerSelector
        gameParticipants={[participant('a', 'Ann'), participant('b', 'Bob')]}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );

    expect(container.querySelector('input[type="text"]')).toBeNull();
    expect(rows()).toHaveLength(2);

    act(() => {
      rows()[1].click();
    });
    expect(onConfirm).toHaveBeenCalledWith('b');
  });

  it('shows taken players last, labelled and non-pickable, instead of hiding them', () => {
    const onConfirm = vi.fn();
    render(
      <TeamPlayerSelector
        gameParticipants={[participant('a', 'Ann'), participant('b', 'Bob')]}
        onClose={() => {}}
        onConfirm={onConfirm}
        selectedPlayerIds={['a']}
        unavailableLabelById={{ a: 'Team 2' }}
      />,
    );

    const [first, second] = rows();
    expect(first.textContent).toContain('Bob');
    expect(second.textContent).toContain('Ann');
    expect(second.textContent).toContain('Team 2');
    expect(second.getAttribute('aria-disabled')).toBe('true');

    act(() => {
      second.click();
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('offers search once the roster is long enough', () => {
    render(
      <TeamPlayerSelector
        gameParticipants={['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => participant(id, id.toUpperCase()))}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );

    expect(container.querySelector('input[type="text"]')).not.toBeNull();
    expect(rows()).toHaveLength(7);
  });
});
