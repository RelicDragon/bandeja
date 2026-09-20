// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { useHeaderStore } from '@/store/headerStore';
import { LeaderboardModeSwitch } from './LeaderboardModeSwitch';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  useHeaderStore.setState({ leaderboardMode: 'players' });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render() {
  act(() => {
    root.render(<LeaderboardModeSwitch />);
  });
}

function tabs(): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>('[role="tab"], button')];
}

describe('LeaderboardModeSwitch (PRD 352)', () => {
  it('offers exactly Players and Pairs', () => {
    render();
    const labels = tabs().map((button) => button.textContent);
    expect(labels.some((label) => label?.includes('pairs.mode.players'))).toBe(true);
    expect(labels.some((label) => label?.includes('pairs.mode.pairs'))).toBe(true);
  });

  it('switches the stored mode to pairs and back without touching other filters', () => {
    useHeaderStore.setState({ leaderboardType: 'social', leaderboardGender: 'all' });
    render();

    const pairsTab = tabs().find((button) => button.textContent?.includes('pairs.mode.pairs'));
    act(() => pairsTab?.click());
    expect(useHeaderStore.getState().leaderboardMode).toBe('pairs');
    // Switching modes keeps the other leaderboard filters exactly as they were.
    expect(useHeaderStore.getState().leaderboardType).toBe('social');
    expect(useHeaderStore.getState().leaderboardGender).toBe('all');

    render();
    const playersTab = tabs().find((button) => button.textContent?.includes('pairs.mode.players'));
    act(() => playersTab?.click());
    expect(useHeaderStore.getState().leaderboardMode).toBe('players');
  });

  it('names the control for screen readers', () => {
    render();
    expect(container.querySelector('[aria-label="pairs.mode.label"]')).not.toBeNull();
  });
});
