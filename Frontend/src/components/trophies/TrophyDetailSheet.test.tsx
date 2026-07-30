// @vitest-environment jsdom

import { act, type HTMLAttributes, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrophyDefinitionView } from '@/types/trophies';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, number>) =>
      key === 'trophies.detail.progress'
        ? `Progress ${values?.current} / ${values?.target}`
        : key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/components/ui/Drawer', () => ({
  Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DrawerContent: ({
    children,
    ...props
  }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  DrawerDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DrawerHeader: ({
    children,
    ...props
  }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@/components/trophies/TrophyArt', () => ({
  TrophyArt: () => <div />,
}));

vi.mock('@/components/trophies/TrophyPinControls', () => ({
  TrophyPinControls: () => null,
}));

vi.mock('@/components/trophies/TrophyRarityBadge', () => ({
  TrophyRarityBadge: () => <span>Rare</span>,
}));

vi.mock('@/components/trophies/TrophyRarityFrame', () => ({
  TrophyRarityFrame: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/trophies/FollowingAchievementEarners', () => ({
  FollowingAchievementEarners: () => null,
}));

vi.mock('@/components/trophies/AchievementFamilyLeaders', () => ({
  AchievementFamilyLeaders: () => null,
}));

import { TrophyDetailSheet } from '@/components/trophies/TrophyDetailSheet';

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

const definition: TrophyDefinitionView = {
  id: 'habit_wins_100',
  rarity: 'RARE',
  artKey: 'habit_wins_100',
  ruleKind: 'HABIT_WINS',
  titleKey: 'trophies.defs.wins100.title',
  descriptionKey: 'trophies.defs.wins100.description',
  threshold: 100,
  multiplicity: 'ONCE',
};

describe('TrophyDetailSheet', () => {
  it('closes from the final chevron control', () => {
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    roots.push(root);
    const onOpenChange = vi.fn();

    act(() =>
      root.render(
        <TrophyDetailSheet
          open
          onOpenChange={onOpenChange}
          definition={definition}
          instance={null}
          instances={[]}
          locked
          progress={null}
          isOwn
        />,
      ),
    );

    const closeButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="trophy-detail-close"]',
    );
    expect(closeButton).not.toBeNull();

    act(() => closeButton!.click());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('centers locked progress and renders its progress bar below', () => {
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    roots.push(root);

    act(() =>
      root.render(
        <TrophyDetailSheet
          open
          onOpenChange={() => undefined}
          definition={definition}
          instance={null}
          instances={[]}
          locked
          progress={{ current: 25, target: 100 }}
          isOwn
        />,
      ),
    );

    const panel = container.querySelector('[data-testid="trophy-detail-progress"]');
    const value = container.querySelector('[data-testid="trophy-detail-progress-value"]');
    const percent = container.querySelector(
      '[data-testid="trophy-detail-progress-percent"]',
    );
    const bar = container.querySelector<HTMLElement>(
      '[data-testid="trophy-detail-progress-bar"]',
    );

    expect(panel?.className).toContain('text-center');
    expect(value?.textContent).toContain('25');
    expect(value?.textContent).toContain('100');
    expect(value?.textContent).not.toContain('%');
    expect(percent?.textContent).toBe('25%');
    expect(percent?.className).toContain('right-0');
    expect(bar?.getAttribute('role')).toBe('progressbar');
    expect(bar?.getAttribute('aria-valuenow')).toBe('25');
    expect(bar?.style.width).toBe('25%');
    expect(bar?.getAttribute('data-max-level')).toBe('false');
    expect(panel?.getAttribute('data-max-level')).toBe('false');
    expect(
      value!.compareDocumentPosition(bar!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('uses emerald chase progress even when targeting catalog max (gold only when unlocked)', () => {
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    roots.push(root);

    act(() =>
      root.render(
        <TrophyDetailSheet
          open
          onOpenChange={() => undefined}
          definition={{
            ...definition,
            id: 'habit_wins_500',
            rarity: 'LEGENDARY',
            artKey: 'habit_wins_500',
            threshold: 500,
          }}
          instance={null}
          instances={[]}
          locked
          progress={{ current: 400, target: 500 }}
          isOwn
        />,
      ),
    );

    const panel = container.querySelector('[data-testid="trophy-detail-progress"]');
    const bar = container.querySelector('[data-testid="trophy-detail-progress-bar"]');
    expect(panel?.getAttribute('data-max-level')).toBe('true');
    expect(bar?.className).toContain('bg-emerald-500');
    expect(bar?.className).not.toContain('from-amber-400');
  });
});
