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

  return {
    motion: { div: MotionDiv },
    useReducedMotion: () => true,
  };
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

import { TrophyStackIcon } from '@/components/trophies/TrophyStackIcon';

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

function commonEntry(): TrophyCabinetEntryView {
  return {
    definition: {
      id: 'habit_first_win',
      rarity: 'COMMON',
      artKey: 'habit_first_win',
      ruleKind: 'HABIT_FIRST_WIN',
      titleKey: 'trophies.defs.firstWin.title',
      descriptionKey: 'trophies.defs.firstWin.description',
      threshold: 1,
      multiplicity: 'ONCE',
    },
    unlocked: true,
    instances: [],
    progress: null,
  };
}

describe('TrophyStackIcon', () => {
  it('renders rarity as a compact visual tag', () => {
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    roots.push(root);

    act(() =>
      root.render(
        <TrophyStackIcon
          entry={commonEntry()}
          locked={false}
          labelVisible
          interactive
          isOwn
          pinsEditable
          pinnedInstanceIds={new Set()}
          openDetailOnClick
        />,
      ),
    );

    const iconButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="trophy-icon-button"]',
    );
    const tag = container.querySelector('[data-testid="trophy-rarity-tag"]');
    const titleSlot = container.querySelector('[data-testid="trophy-title-slot"]');
    expect(iconButton).not.toBeNull();
    expect(tag).not.toBeNull();
    expect(titleSlot).not.toBeNull();
    expect(iconButton?.contains(titleSlot)).toBe(false);
    expect(iconButton?.contains(tag)).toBe(false);
    expect(tag?.textContent).toBe('trophies.rarity.common');
    expect(tag?.className).toContain('rounded-full');
    expect(tag?.className).toContain('text-[8px]');
    expect(titleSlot?.className).toContain('h-7');
    expect(
      titleSlot!.compareDocumentPosition(tag!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    act(() => tag!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.querySelector('[data-testid="trophy-detail-drawer"]')).toBeNull();

    act(() => iconButton!.click());
    const drawer = container.querySelector('[data-testid="trophy-detail-drawer"]');
    expect(drawer).not.toBeNull();
    expect(drawer?.parentElement).toBe(container);
  });
});
