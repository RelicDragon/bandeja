// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerInviteVirtualList } from './PlayerInviteVirtualList';
import type { InviteListRow } from './inviteListRows';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const rows: InviteListRow[] = Array.from({ length: 100 }, (_, index) => ({
  kind: 'user',
  id: String(index),
  user: {
    id: String(index), firstName: `Player ${index}`, level: 3, socialLevel: 1,
    gender: 'MALE', approvedLevel: false, isTrainer: false,
  },
}));

describe('invite list scroll rendering', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute('data-index') ? 88 : 300;
    });
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders new rows without rerendering rows that remain visible', async () => {
    const renderRow = vi.fn((row: InviteListRow) => <button>{row.id}</button>);
    await act(async () => {
      root.render(<PlayerInviteVirtualList rows={rows} renderRow={renderRow} />);
    });
    const viewport = container.firstElementChild as HTMLElement;
    const retained = container.querySelector('[data-index="5"] button');
    expect(retained).not.toBeNull();
    const initialCalls = renderRow.mock.calls.filter(([row]) => row.id === '5').length;
    const initialLastRow = container.querySelector('[data-index="11"]');
    expect(initialLastRow).toBeNull();

    await act(async () => {
      viewport.scrollTop = 188;
      viewport.dispatchEvent(new Event('scroll'));
    });

    expect(container.querySelector('[data-index="11"]')).not.toBeNull();
    expect(container.querySelector('[data-index="5"] button')).toBe(retained);
    expect(renderRow.mock.calls.filter(([row]) => row.id === '5')).toHaveLength(initialCalls);

    // Parent selection changes still update retained row content in place.
    await act(async () => {
      root.render(
        <PlayerInviteVirtualList
          rows={rows}
          renderRow={(row) => <button aria-pressed={row.id === '5'}>{row.id}</button>}
        />,
      );
    });
    expect(container.querySelector('[data-index="5"] button')).toBe(retained);
    expect(retained?.getAttribute('aria-pressed')).toBe('true');
  });
});
