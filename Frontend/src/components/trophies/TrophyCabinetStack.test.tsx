// @vitest-environment jsdom

import { act, forwardRef, useState, type HTMLAttributes } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrophyCabinetEntryView } from '@/types/trophies';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('framer-motion', () => {
  const MotionDiv = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
    function MotionDiv(
      {
        // Motion-only props must not leak into the test DOM.
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

vi.mock('@/components/trophies/TrophyStackIcon', () => ({
  TrophyStackIcon: ({
    entry,
    labelVisible,
  }: {
    entry: TrophyCabinetEntryView;
    labelVisible?: boolean;
  }) => (
    <>
      <div data-icon={entry.definition.id}>
        <button
          type="button"
          data-testid="trophy-icon-button"
          onClick={(event) => event.stopPropagation()}
        />
        <span data-stack-label={labelVisible ? 'visible' : 'hidden'}>
          {labelVisible ? entry.definition.titleKey : null}
        </span>
      </div>
      {labelVisible
        ? createPortal(
            <button
              type="button"
              data-testid={`mock-drawer-backdrop-${entry.definition.id}`}
            />,
            document.body,
          )
        : null}
    </>
  ),
}));

import { TrophyCabinetStack } from '@/components/trophies/TrophyCabinetStack';

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

function entry(id: string, title: string): TrophyCabinetEntryView {
  return {
    definition: {
      id,
      rarity: 'COMMON',
      artKey: id,
      ruleKind: 'HABIT_WINS',
      titleKey: title,
      descriptionKey: `${title}.description`,
      threshold: id === 'habit_first_win' ? 1 : 10,
      multiplicity: 'ONCE',
    },
    unlocked: true,
    instances: [],
    progress: null,
  };
}

function Harness() {
  const [expanded, setExpanded] = useState(false);
  return (
    <TrophyCabinetStack
      entries={[
        entry('habit_wins_10', 'trophies.defs.wins10.title'),
        entry('habit_first_win', 'trophies.defs.firstWin.title'),
      ]}
      unlocked
      isOwn
      pinsEditable
      pinnedInstanceIds={new Set()}
      expanded={expanded}
      onExpandedChange={setExpanded}
    />
  );
}

function LockedExpandedHarness() {
  const lockedEntry = (id: string, title: string): TrophyCabinetEntryView => ({
    ...entry(id, title),
    unlocked: false,
    progress: { current: 25, target: 100 },
  });

  return (
    <TrophyCabinetStack
      entries={[
        lockedEntry('habit_wins_500', 'trophies.defs.wins500.title'),
        lockedEntry('habit_wins_100', 'trophies.defs.wins100.title'),
      ]}
      unlocked={false}
      isOwn
      pinsEditable
      pinnedInstanceIds={new Set()}
      expanded
      onExpandedChange={() => undefined}
    />
  );
}

describe('TrophyCabinetStack', () => {
  it('moves persistent icons inside one persistent group frame', () => {
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => root.render(<Harness />));

    const frameBefore = container.querySelector('[data-testid="trophy-stack-frame"]');
    const iconsBefore = Array.from(container.querySelectorAll('[data-stack-entry]'));
    const expandButton = container.querySelector<HTMLButtonElement>(
      'button[aria-expanded="false"]',
    );

    expect(frameBefore).not.toBeNull();
    expect(frameBefore?.className).not.toContain('h-40');
    const heightProbe = frameBefore?.querySelector(
      '[data-testid="trophy-stack-height-probe"]',
    );
    expect(heightProbe).not.toBeNull();
    expect(heightProbe?.className).toContain('pb-6');
    expect(
      frameBefore
        ?.querySelector<HTMLElement>('[data-testid="trophy-stack-collapsed-label"]')
        ?.style.top,
    ).toBe('6rem');
    const collapsedSubtitle = frameBefore?.querySelector(
      '[data-testid="trophy-stack-collapsed-subtitle"]',
    );
    expect(collapsedSubtitle).not.toBeNull();
    expect(collapsedSubtitle?.className).toContain('line-clamp-2');
    expect(collapsedSubtitle?.className).not.toContain('truncate');
    expect(iconsBefore).toHaveLength(2);
    expect(container.querySelector('button button')).toBeNull();
    expect(expandButton).not.toBeNull();

    act(() => expandButton!.click());

    const frameAfter = container.querySelector('[data-testid="trophy-stack-frame"]');
    const iconsAfter = Array.from(container.querySelectorAll('[data-stack-entry]'));

    expect(frameAfter).toBe(frameBefore);
    expect(frameAfter?.getAttribute('data-state')).toBe('expanded');
    expect(iconsAfter).toHaveLength(2);
    expect(iconsAfter[0]).toBe(iconsBefore[0]);
    expect(iconsAfter[1]).toBe(iconsBefore[1]);
    expect(container.querySelector('button button')).toBeNull();
    expect(container.querySelectorAll('[data-stack-label="visible"]')).toHaveLength(2);

    const frameToggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="trophy-stack-toggle"]',
    );
    expect(frameToggle?.disabled).toBe(true);
    expect(frameToggle?.className).toContain('pointer-events-none');

    const collapseButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="trophies.cabinet.collapseStack"]',
    );
    const countBadge = container.querySelector('[data-testid="trophy-stack-count"]');
    expect(collapseButton?.className).toContain('rounded-full');
    expect(collapseButton?.textContent?.trim()).toBe('‹');
    expect(countBadge?.className).toContain('right-1');
    expect(countBadge?.textContent?.trim()).toBe('×2');

    const drawerBackdrop = document.querySelector<HTMLButtonElement>(
      '[data-testid="mock-drawer-backdrop-habit_wins_10"]',
    );
    act(() => drawerBackdrop!.click());
    expect(frameAfter?.getAttribute('data-state')).toBe('expanded');

    const visibleLabel = container.querySelector('[data-stack-label="visible"]');
    act(() =>
      visibleLabel!.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    expect(frameAfter?.getAttribute('data-state')).toBe('collapsed');
  });

  it('keeps group progress pinned to the bottom while expanded', () => {
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => root.render(<LockedExpandedHarness />));

    const progress = container.querySelector('[data-testid="trophy-progress"]');
    expect(progress).not.toBeNull();
    expect(progress?.className).toContain('bottom-2');
    expect(progress?.getAttribute('aria-hidden')).toBeNull();
  });
});
