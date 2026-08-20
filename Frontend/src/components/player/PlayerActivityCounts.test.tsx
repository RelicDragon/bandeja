// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) => `${key}:${opts?.count ?? ''}`,
  }),
}));

import { PlayerActivityCounts } from './PlayerActivityCounts';

const roots: Root[] = [];
const containers: HTMLDivElement[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  for (const container of containers.splice(0)) {
    container.remove();
  }
});

function render(node: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(node);
  });
  return container;
}

describe('PlayerActivityCounts', () => {
  it('shows rated games and training attendance', () => {
    const el = render(
      <PlayerActivityCounts gamesPlayed={12} trainingAttendanceCount={4} />,
    );
    expect(el.textContent).toContain('playerCard.gamesCount:12');
    expect(el.textContent).toContain('playerCard.trainingsCount:4');
  });

  it('shows zero without crashing', () => {
    const el = render(
      <PlayerActivityCounts gamesPlayed={0} trainingAttendanceCount={0} />,
    );
    const row = el.querySelector('[data-testid="player-activity-counts"]');
    expect(row).not.toBeNull();
    expect(el.textContent).toContain('playerCard.gamesCount:0');
    expect(el.textContent).toContain('playerCard.trainingsCount:0');
  });

  it('treats missing numbers as zero', () => {
    const el = render(
      <PlayerActivityCounts
        gamesPlayed={Number.NaN}
        trainingAttendanceCount={undefined as unknown as number}
      />,
    );
    expect(el.textContent).toContain('playerCard.gamesCount:0');
    expect(el.textContent).toContain('playerCard.trainingsCount:0');
  });
});
