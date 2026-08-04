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
    pinnedInstanceIds,
  }: {
    entry: TrophyCabinetEntryView;
    labelVisible?: boolean;
    pinnedInstanceIds?: ReadonlySet<string>;
  }) => (
    <>
      <div data-icon={entry.definition.id}>
        <button
          type="button"
          data-testid="trophy-icon-button"
          onClick={(event) => event.stopPropagation()}
        />
        {labelVisible &&
          entry.instances.some((i) => pinnedInstanceIds?.has(i.id)) && (
            <span data-testid="trophy-pinned-badge">★</span>
          )}
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

function entry(id: string, title: string, threshold = 10): TrophyCabinetEntryView {
  return {
    definition: {
      id,
      rarity: 'COMMON',
      artKey: id,
      ruleKind: 'HABIT_WINS',
      titleKey: title,
      descriptionKey: `${title}.description`,
      threshold,
      type: 'MILESTONE',
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
        entry('habit_wins_10', 'trophies.defs.wins10.title', 10),
        entry('habit_first_win', 'trophies.defs.firstWin.title', 1),
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
  const lockedEntry = (id: string, title: string, threshold: number): TrophyCabinetEntryView => ({
    ...entry(id, title, threshold),
    unlocked: false,
    progress: { current: 25, target: threshold },
  });

  return (
    <TrophyCabinetStack
      entries={[
        lockedEntry('habit_wins_500', 'trophies.defs.wins500.title', 500),
        lockedEntry('habit_wins_100', 'trophies.defs.wins100.title', 100),
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

function MixedProgressHarness() {
  return (
    <TrophyCabinetStack
      entries={[
        {
          ...entry('habit_wins_10', 'trophies.defs.wins10.title', 10),
          unlocked: true,
          progress: null,
        },
        {
          ...entry('habit_wins_100', 'trophies.defs.wins100.title', 100),
          unlocked: false,
          progress: { current: 25, target: 100 },
        },
        {
          ...entry('habit_wins_500', 'trophies.defs.wins500.title', 500),
          unlocked: false,
          progress: { current: 25, target: 500 },
        },
      ]}
      unlocked
      isOwn
      pinsEditable
      pinnedInstanceIds={new Set()}
      expanded
      onExpandedChange={() => undefined}
    />
  );
}

function MaxLevelChaseHarness() {
  return (
    <TrophyCabinetStack
      entries={[
        {
          ...entry('habit_wins_10', 'trophies.defs.wins10.title', 10),
          unlocked: true,
          progress: null,
        },
        {
          ...entry('habit_wins_500', 'trophies.defs.wins500.title', 500),
          definition: {
            ...entry('habit_wins_500', 'trophies.defs.wins500.title', 500).definition,
            rarity: 'LEGENDARY',
          },
          unlocked: false,
          progress: { current: 400, target: 500 },
        },
      ]}
      unlocked
      isOwn
      pinsEditable
      pinnedInstanceIds={new Set()}
      expanded
      onExpandedChange={() => undefined}
    />
  );
}

function PinnedCollapsedHarness() {
  return (
    <TrophyCabinetStack
      entries={[
        {
          ...entry('habit_wins_10', 'trophies.defs.wins10.title', 10),
          instances: [
            {
              id: 'inst-pinned',
              definitionId: 'habit_wins_10',
              earnedAt: '2026-01-01T00:00:00.000Z',
              sport: null,
              place: null,
              source: null,
            },
          ],
        },
        entry('habit_first_win', 'trophies.defs.firstWin.title', 1),
      ]}
      unlocked
      isOwn
      pinsEditable
      pinnedInstanceIds={new Set(['inst-pinned'])}
      expanded={false}
      onExpandedChange={() => undefined}
    />
  );
}

function PinnedExpandedHarness() {
  return (
    <TrophyCabinetStack
      entries={[
        {
          ...entry('habit_wins_10', 'trophies.defs.wins10.title', 10),
          instances: [
            {
              id: 'inst-pinned',
              definitionId: 'habit_wins_10',
              earnedAt: '2026-01-01T00:00:00.000Z',
              sport: null,
              place: null,
              source: null,
            },
          ],
        },
        entry('habit_first_win', 'trophies.defs.firstWin.title', 1),
      ]}
      unlocked
      isOwn
      pinsEditable
      pinnedInstanceIds={new Set(['inst-pinned'])}
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

  it('shows chase progress on mixed unlocked+locked stacks until max level', () => {
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => root.render(<MixedProgressHarness />));

    const progress = container.querySelector('[data-testid="trophy-progress"]');
    expect(progress).not.toBeNull();
    expect(progress?.className).toContain('bottom-2');
    const fill = container.querySelector('[data-testid="trophy-progress-fill"]');
    expect(fill?.getAttribute('data-max-level')).toBe('false');
    expect(fill?.className).toContain('bg-emerald-500');
  });

  it('keeps emerald progress fill when chasing the max level (gold only after unlock)', () => {
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => root.render(<MaxLevelChaseHarness />));

    const fill = container.querySelector('[data-testid="trophy-progress-fill"]');
    expect(fill?.getAttribute('data-max-level')).toBe('true');
    expect(fill?.className).toContain('bg-emerald-500');
    expect(fill?.className).not.toContain('from-amber-400');
  });

  it('shows a single group pin badge when collapsed with a pinned tier', () => {
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => root.render(<PinnedCollapsedHarness />));

    expect(container.querySelectorAll('[data-testid="trophy-stack-pinned-badge"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="trophy-pinned-badge"]')).toHaveLength(0);
  });

  it('moves pin badges onto pinned tier icons when expanded', () => {
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => root.render(<PinnedExpandedHarness />));

    const groupBadge = container.querySelector('[data-testid="trophy-stack-pinned-badge"]');
    expect(groupBadge?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelectorAll('[data-testid="trophy-pinned-badge"]')).toHaveLength(1);
  });
});
