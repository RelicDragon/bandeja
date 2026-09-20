// @vitest-environment jsdom
import { act, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimatedGameList } from './AnimatedGameList';

/**
 * Covers the list's own contract. The framer mock is a passthrough, so this does
 * not exercise popLayout's positioning (that needs a real browser) — but the
 * `presenceKey` behaviour it does cover is plain React remount semantics, which
 * is precisely the mechanism that makes a day switch swap instantly instead of
 * cross-fading two full sets of cards.
 */
vi.mock('framer-motion', async () => {
  const { createElement } = await import('react');
  return {
    AnimatePresence: ({ children }: { children: ReactNode }) => children,
    motion: {
      div: ({ children, ...props }: { children?: ReactNode }) =>
        createElement('div', { 'data-motion': 'row', ...props }, children),
    },
  };
});
vi.mock('@/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => reduceMotion,
}));

let reduceMotion = false;

const mountCounts = new Map<string, number>();
function Row({ id }: { id: string }) {
  useEffect(() => {
    mountCounts.set(id, (mountCounts.get(id) ?? 0) + 1);
  }, [id]);
  return <span data-testid={id}>{id}</span>;
}

const getKey = (item: { id: string }) => item.id;
const renderItem = (item: { id: string }) => <Row id={item.id} />;

let root: Root;
let container: HTMLDivElement;

function render(items: { id: string }[], presenceKey?: string) {
  act(() =>
    root.render(
      <AnimatedGameList
        items={items}
        getKey={getKey}
        renderItem={renderItem}
        presenceKey={presenceKey}
      />,
    ),
  );
}

const ids = () =>
  [...container.querySelectorAll('[data-testid]')].map((el) => el.getAttribute('data-testid'));

describe('AnimatedGameList', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    reduceMotion = false;
    mountCounts.clear();
    container = document.createElement('div');
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
  });

  it('renders items in order and reflects additions and removals', () => {
    render([{ id: 'a' }, { id: 'b' }]);
    expect(ids()).toEqual(['a', 'b']);

    render([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    expect(ids()).toEqual(['a', 'b', 'c']);

    render([{ id: 'b' }, { id: 'c' }]);
    expect(ids()).toEqual(['b', 'c']);
  });

  it('keeps surviving rows mounted when no presenceKey is given', () => {
    // MyTab / past games / list view: rows come and go individually, so a row
    // that survives the update must not remount and lose its state.
    render([{ id: 'a' }, { id: 'b' }]);
    render([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    expect(mountCounts.get('a')).toBe(1);
    expect(mountCounts.get('b')).toBe(1);
  });

  it('keeps rows mounted while the presenceKey is unchanged', () => {
    render([{ id: 'a' }], '2026-06-01');
    render([{ id: 'a' }, { id: 'b' }], '2026-06-01');
    expect(mountCounts.get('a')).toBe(1);
  });

  it('remounts the set when the presenceKey changes', () => {
    // Find calendar day switch: the whole set turns over, so the old rows go at
    // once rather than animating out underneath the incoming ones.
    render([{ id: 'a' }], '2026-06-01');
    expect(mountCounts.get('a')).toBe(1);

    render([{ id: 'a' }], '2026-06-02');
    expect(mountCounts.get('a')).toBe(2);
  });

  it('carries a positioning context for absolutely positioned exits', () => {
    render([{ id: 'a' }]);
    expect(container.firstElementChild?.className).toContain('relative');
  });

  it('applies the caller className alongside the positioning context', () => {
    act(() =>
      root.render(
        <AnimatedGameList
          items={[{ id: 'a' }]}
          getKey={getKey}
          renderItem={renderItem}
          className="space-y-4"
        />,
      ),
    );
    const cls = container.firstElementChild?.className ?? '';
    expect(cls).toContain('relative');
    expect(cls).toContain('space-y-4');
  });

  it('renders a plain list under reduced motion', () => {
    reduceMotion = true;
    render([{ id: 'a' }, { id: 'b' }]);
    expect(ids()).toEqual(['a', 'b']);
    expect(container.querySelector('[data-motion="row"]')).toBeNull();
    expect(container.firstElementChild?.className).toContain('relative');
  });
});
