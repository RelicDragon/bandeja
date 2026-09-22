/**
 * @vitest-environment jsdom
 *
 * PRD 363 — the Find empty state always offers a next step: a create action
 * named after the day, a clear-filters action only when something is set,
 * and the looking-to-play line only when the caller resolved one.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { enGB } from 'date-fns/locale/en-GB';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayIntentUiContext, type PlayIntentCtx } from '@/components/playIntent/PlayIntentContext';
import { FindRecoveryEmptyState } from './FindRecoveryEmptyState';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('@/utils/dateFormat', () => ({
  getAppDateFnsLocale: () => enGB,
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...stripMotionProps(props)}>{children}</div>
    ),
    p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
      <p {...stripMotionProps(props)}>{children}</p>
    ),
  },
}));

function stripMotionProps<T extends Record<string, unknown>>(props: T): T {
  const copy = { ...props };
  for (const key of ['initial', 'animate', 'transition', 'exit', 'layout']) delete copy[key];
  return copy;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const TODAY = '2026-09-22';

type RenderProps = Partial<Parameters<typeof FindRecoveryEmptyState>[0]> & { ctx?: PlayIntentCtx | null };

function render(overrides: RenderProps = {}) {
  const onCreate = vi.fn();
  const onClearFilters = vi.fn();
  const { ctx = null, ...props } = overrides;
  const element = (
    <FindRecoveryEmptyState
      title="No games found"
      createDay={TODAY}
      todayKey={TODAY}
      canClearFilters={false}
      onCreate={onCreate}
      onClearFilters={onClearFilters}
      {...props}
    />
  );
  act(() => {
    root.render(ctx ? <PlayIntentUiContext.Provider value={ctx}>{element}</PlayIntentUiContext.Provider> : element);
  });
  const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  return { onCreate, onClearFilters, byTestId };
}

function fakeCtx(overrides: Partial<PlayIntentCtx> = {}): PlayIntentCtx {
  return {
    enabled: true,
    looking: false,
    isLoading: false,
    openCompose: vi.fn(),
    openLobby: vi.fn(),
    openProposal: vi.fn(),
    stopLooking: vi.fn(),
    proposal: null,
    whenLabel: '',
    idleWhenLabel: '',
    emptyPool: true,
    othersCount: 0,
    stripMembers: [],
    proposalArrivalToken: 0,
    ...overrides,
  };
}

describe('FindRecoveryEmptyState', () => {
  it('always shows the title and a create action, named after the day', () => {
    const { byTestId } = render();
    expect(container.textContent).toContain('No games found');
    expect(byTestId('find-recovery-create')?.textContent).toBe('Create a game today');

    render({ createDay: '2026-09-23' });
    expect(byTestId('find-recovery-create')?.textContent).toBe('Create a game tomorrow');

    render({ createDay: '2026-09-24' });
    expect(byTestId('find-recovery-create')?.textContent).toBe('Create a game on Thu 24 Sep');
  });

  it('shows Clear filters only when a filter is active, and never zero actions', () => {
    const noFilters = render({ canClearFilters: false });
    expect(noFilters.byTestId('find-recovery-clear')).toBeNull();
    expect(noFilters.byTestId('find-recovery-create')).not.toBeNull();

    const { byTestId, onClearFilters, onCreate } = render({ canClearFilters: true });
    expect(byTestId('find-recovery-clear')?.textContent).toBe('Clear filters');
    act(() => byTestId('find-recovery-clear')?.click());
    expect(onClearFilters).toHaveBeenCalledTimes(1);
    act(() => byTestId('find-recovery-create')?.click());
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('renders no looking line at all when there is nothing to show', () => {
    const { byTestId } = render({ looking: null });
    expect(byTestId('find-recovery-looking')).toBeNull();
    expect(container.textContent).not.toContain('looking');
  });

  it('renders the looking line as plain text without a lobby to open', () => {
    const { byTestId } = render({ looking: { count: 5, window: 'today', cityName: 'Belgrade' } });
    const line = byTestId('find-recovery-looking');
    expect(line?.tagName).toBe('SPAN');
    expect(line?.textContent).toBe('5 people are looking to play today in Belgrade');
  });

  it('names the two-day window after 18:00', () => {
    const { byTestId } = render({ looking: { count: 4, window: 'todayAndTomorrow', cityName: 'Belgrade' } });
    expect(byTestId('find-recovery-looking')?.textContent).toBe(
      '4 people are looking to play today and tomorrow in Belgrade',
    );
  });

  it('opens the intent editor from the provider when not looking, the lobby when looking', () => {
    const idle = fakeCtx();
    const { byTestId } = render({ looking: { count: 5, window: 'today', cityName: 'Belgrade' }, ctx: idle });
    expect(byTestId('find-recovery-looking')?.tagName).toBe('BUTTON');
    act(() => byTestId('find-recovery-looking')?.click());
    expect(idle.openCompose).toHaveBeenCalledTimes(1);
    expect(idle.openLobby).not.toHaveBeenCalled();

    const busy = fakeCtx({ looking: true });
    const second = render({ looking: { count: 5, window: 'today', cityName: 'Belgrade' }, ctx: busy });
    act(() => second.byTestId('find-recovery-looking')?.click());
    expect(busy.openLobby).toHaveBeenCalledTimes(1);
    expect(busy.openCompose).not.toHaveBeenCalled();
  });

  it('prefers an explicit lobby handler over the provider', () => {
    const ctx = fakeCtx();
    const onOpenLobby = vi.fn();
    const { byTestId } = render({
      looking: { count: 3, window: 'today', cityName: 'Belgrade' },
      ctx,
      onOpenLobby,
    });
    act(() => byTestId('find-recovery-looking')?.click());
    expect(onOpenLobby).toHaveBeenCalledTimes(1);
    expect(ctx.openCompose).not.toHaveBeenCalled();
  });
});
