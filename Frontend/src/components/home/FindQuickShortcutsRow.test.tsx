/**
 * @vitest-environment jsdom
 *
 * PRD 358 — the shortcut row is three options in the house segmented control:
 * it highlights the option the calendar currently shows (Today when today is
 * selected, Tomorrow, or Weekend), at most one at a time, and re-tapping the
 * highlighted one reports a clear.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FindQuickShortcutsRow } from './FindQuickShortcutsRow';
import type { QuickShortcutAction } from './findQuickShortcuts';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

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

function renderRow(activeKind: QuickShortcutAction | null) {
  const onSelect = vi.fn();
  const onClear = vi.fn();
  act(() => {
    root.render(
      <FindQuickShortcutsRow activeKind={activeKind} onSelect={onSelect} onClear={onClear} />,
    );
  });
  const tabs = () => Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  return { onSelect, onClear, tabs };
}

describe('FindQuickShortcutsRow', () => {
  it('renders three labelled options in order', () => {
    const { tabs } = renderRow(null);
    expect(tabs().map((tab) => tab.textContent)).toEqual(['Today', 'Tomorrow', 'Weekend']);
    expect(tabs().map((tab) => tab.getAttribute('aria-label'))).toEqual([
      'Today',
      'Tomorrow',
      'Weekend',
    ]);
    expect(container.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe(
      'Day shortcuts',
    );
  });

  it('highlights exactly one option, including Today when today is shown', () => {
    const { tabs } = renderRow('weekend');
    expect(tabs().map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'false',
      'false',
      'true',
    ]);
    const today = renderRow('today');
    expect(today.tabs().map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    const none = renderRow(null);
    expect(none.tabs().every((tab) => tab.getAttribute('aria-selected') === 'false')).toBe(true);
  });

  it('every tap selects its option', () => {
    const { tabs, onSelect, onClear } = renderRow(null);
    act(() => tabs()[0].click());
    expect(onSelect).toHaveBeenLastCalledWith('today');
    act(() => tabs()[1].click());
    expect(onSelect).toHaveBeenLastCalledWith('tomorrow');
    expect(onClear).not.toHaveBeenCalled();
  });

  it('re-tapping the highlighted option reports a clear instead of re-selecting', () => {
    const { tabs, onSelect, onClear } = renderRow('tomorrow');
    act(() => tabs()[1].click());
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
    const today = renderRow('today');
    act(() => today.tabs()[0].click());
    expect(today.onClear).toHaveBeenCalledTimes(1);
  });
});
