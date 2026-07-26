// @vitest-environment jsdom

import { act, forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrophyCabinetEntryView } from '@/types/trophies';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('framer-motion', () => {
  const MotionDiv = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
    function MotionDiv(
      {
        animate: _animate,
        initial: _initial,
        transition: _transition,
        ...props
      }: HTMLAttributes<HTMLDivElement> & {
        animate?: unknown;
        initial?: unknown;
        transition?: unknown;
      },
      ref,
    ) {
      return <div ref={ref} {...props} />;
    },
  );

  return { motion: { div: MotionDiv } };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/trophies/TrophyArt', () => ({
  TrophyArt: () => <div data-testid="trophy-art" />,
}));

vi.mock('@/components/trophies/TrophyRarityFrame', () => ({
  TrophyRarityFrame: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/trophies/TrophyDetailSheet', () => ({
  TrophyDetailSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="trophy-detail-drawer" /> : null,
}));

import { TrophyCabinetCard } from '@/components/trophies/TrophyCabinetCard';

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

function lockedEntry(): TrophyCabinetEntryView {
  return {
    definition: {
      id: 'habit_wins_100',
      rarity: 'RARE',
      artKey: 'habit_wins_100',
      ruleKind: 'HABIT_WINS',
      titleKey: 'trophies.defs.wins100.title',
      descriptionKey: 'trophies.defs.wins100.description',
      threshold: 100,
      multiplicity: 'ONCE',
    },
    unlocked: false,
    instances: [],
    progress: { current: 25, target: 100 },
  };
}

describe('TrophyCabinetCard', () => {
  it('orders icon, fixed title slot, rarity tag, then bottom progress', () => {
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    roots.push(root);

    act(() =>
      root.render(
        <TrophyCabinetCard
          entry={lockedEntry()}
          isOwn
          pinsEditable
          pinnedInstanceIds={new Set()}
        />,
      ),
    );

    const art = container.querySelector('[data-testid="trophy-art"]');
    const title = container.querySelector('[data-testid="trophy-title-slot"]');
    const tag = container.querySelector('[data-testid="trophy-rarity-tag"]');
    const footer = container.querySelector('[data-testid="trophy-card-footer"]');
    const progress = container.querySelector('[data-testid="trophy-progress"]');

    expect(title?.className).toContain('h-7');
    expect(footer?.className).toContain('mt-auto');
    expect(tag).not.toBeNull();
    expect(progress).not.toBeNull();

    const ordered = [art, title, tag, progress];
    for (let index = 0; index < ordered.length - 1; index += 1) {
      expect(
        ordered[index]!.compareDocumentPosition(ordered[index + 1]!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }

    act(() => container.querySelector<HTMLButtonElement>('button')!.click());
    expect(
      container.querySelector('[data-testid="trophy-detail-drawer"]'),
    ).not.toBeNull();
  });
});
