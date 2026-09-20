/**
 * @vitest-environment jsdom
 *
 * CONTRACT §7.2 / §7.1 — `SegmentedSwitch` is the house segmented control and
 * PRDs 345, 350, 352 and 355 all promise "arrow-key support on segmented
 * controls". This pins the roving-tabindex model so a refactor cannot quietly
 * drop it again:
 *
 * - exactly one tab is in the tab order, and it is the selected one;
 * - Arrow keys **on the control's own axis** move focus *and* selection,
 *   wrapping at both ends, and the cross-axis keys are left to the browser so
 *   ArrowDown still scrolls the page on a horizontal strip;
 * - Home / End jump to the first / last enabled tab, on both axes;
 * - disabled tabs are skipped, never focused;
 * - Arrow Left / Right mirror under `dir="rtl"`;
 * - the vertical variant advertises `aria-orientation="vertical"`;
 * - toggle mode (`toggleIds`) stays a plain `role="group"` of independent
 *   buttons — every button tabbable, no arrow-key hijacking.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SegmentedSwitch, type SegmentedSwitchTab } from './SegmentedSwitch';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  document.documentElement.dir = 'ltr';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.documentElement.dir = 'ltr';
});

const TABS: SegmentedSwitchTab[] = [
  { id: 'all', label: 'All' },
  { id: 'frames', label: 'Frames' },
  { id: 'chat', label: 'Chat' },
];

interface SwitchOverrides {
  tabs?: SegmentedSwitchTab[];
  activeId?: string | null;
  allowDeselect?: boolean;
  orientation?: 'horizontal' | 'vertical';
}

function renderSwitch(overrides: SwitchOverrides = {}) {
  const onChange = vi.fn();
  const { tabs: tabList = TABS, activeId = 'all', orientation, allowDeselect } = overrides;
  act(() => {
    root.render(
      allowDeselect ? (
        <SegmentedSwitch
          layoutId="test-switch"
          tabs={tabList}
          allowDeselect
          activeId={activeId}
          onChange={onChange}
          showOnlyActiveTabText={false}
          ariaLabel="Category"
          orientation={orientation}
        />
      ) : (
        <SegmentedSwitch
          layoutId="test-switch"
          tabs={tabList}
          activeId={activeId ?? 'all'}
          onChange={onChange}
          showOnlyActiveTabText={false}
          ariaLabel="Category"
          orientation={orientation}
        />
      ),
    );
  });
  return { onChange };
}

function tabs(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
}

function press(key: string) {
  act(() => {
    (document.activeElement ?? container).dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
  });
}

describe('SegmentedSwitch keyboard model', () => {
  it('puts only the selected tab in the tab order', () => {
    renderSwitch({ activeId: 'chat' });
    expect(tabs().map((tab) => tab.tabIndex)).toEqual([-1, -1, 0]);
  });

  it('falls back to the first tab when nothing is selected (allowDeselect)', () => {
    renderSwitch({ allowDeselect: true, activeId: null });
    expect(tabs().map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
  });

  it('moves focus and selection with ArrowRight, wrapping at the end', () => {
    const { onChange } = renderSwitch({ activeId: 'all' });
    tabs()[0]?.focus();

    press('ArrowRight');
    expect(onChange).toHaveBeenLastCalledWith('frames');
    expect(document.activeElement).toBe(tabs()[1]);

    press('ArrowRight');
    expect(onChange).toHaveBeenLastCalledWith('chat');

    press('ArrowRight');
    expect(onChange).toHaveBeenLastCalledWith('all');
    expect(document.activeElement).toBe(tabs()[0]);
  });

  it('moves backwards with ArrowLeft, wrapping at the start', () => {
    const { onChange } = renderSwitch({ activeId: 'all' });
    tabs()[0]?.focus();

    press('ArrowLeft');
    expect(onChange).toHaveBeenLastCalledWith('chat');
    expect(document.activeElement).toBe(tabs()[2]);

    press('ArrowLeft');
    expect(onChange).toHaveBeenLastCalledWith('frames');
    expect(document.activeElement).toBe(tabs()[1]);
  });

  /*
   * WAI-ARIA reserves Up/Down for a *vertical* composite. On the ~30 horizontal
   * callers, swallowing ArrowDown stopped the page scrolling and — because this
   * control activates automatically — silently switched the tab and fired
   * `onChange`, which on several callers refetches a list.
   */
  it('ignores ArrowUp / ArrowDown on a horizontal switch', () => {
    const { onChange } = renderSwitch({ activeId: 'frames' });
    tabs()[1]?.focus();

    for (const key of ['ArrowDown', 'ArrowUp'] as const) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      act(() => {
        (document.activeElement ?? container).dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(false);
    }

    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(tabs()[1]);
  });

  it('uses ArrowUp / ArrowDown on a vertical switch and ignores Left / Right', () => {
    const { onChange } = renderSwitch({ activeId: 'all', orientation: 'vertical' });
    tabs()[0]?.focus();

    press('ArrowDown');
    expect(onChange).toHaveBeenLastCalledWith('frames');
    expect(document.activeElement).toBe(tabs()[1]);

    press('ArrowUp');
    expect(onChange).toHaveBeenLastCalledWith('all');
    expect(document.activeElement).toBe(tabs()[0]);

    onChange.mockClear();
    const horizontal = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      (document.activeElement ?? container).dispatchEvent(horizontal);
    });
    expect(horizontal.defaultPrevented).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps Home / End working on both axes', () => {
    const { onChange } = renderSwitch({ activeId: 'all', orientation: 'vertical' });
    tabs()[0]?.focus();

    press('End');
    expect(onChange).toHaveBeenLastCalledWith('chat');
    expect(document.activeElement).toBe(tabs()[2]);

    press('Home');
    expect(onChange).toHaveBeenLastCalledWith('all');
  });

  it('jumps to the ends with Home and End', () => {
    const { onChange } = renderSwitch({ activeId: 'frames' });
    tabs()[1]?.focus();

    press('End');
    expect(onChange).toHaveBeenLastCalledWith('chat');
    expect(document.activeElement).toBe(tabs()[2]);

    press('Home');
    expect(onChange).toHaveBeenLastCalledWith('all');
    expect(document.activeElement).toBe(tabs()[0]);
  });

  it('skips disabled tabs instead of focusing them', () => {
    const { onChange } = renderSwitch({
      tabs: [
        { id: 'all', label: 'All' },
        { id: 'frames', label: 'Frames', disabled: true },
        { id: 'chat', label: 'Chat' },
      ],
      activeId: 'all',
    });
    tabs()[0]?.focus();

    press('ArrowRight');
    expect(onChange).toHaveBeenLastCalledWith('chat');
    expect(document.activeElement).toBe(tabs()[2]);

    press('End');
    expect(onChange).toHaveBeenLastCalledWith('chat');
  });

  it('mirrors ArrowLeft / ArrowRight under dir="rtl"', () => {
    document.documentElement.dir = 'rtl';
    const { onChange } = renderSwitch({ activeId: 'frames' });
    tabs()[1]?.focus();

    press('ArrowRight');
    expect(onChange).toHaveBeenLastCalledWith('all');

    tabs()[1]?.focus();
    press('ArrowLeft');
    expect(onChange).toHaveBeenLastCalledWith('chat');
  });

  it('leaves unrelated keys to the browser', () => {
    const { onChange } = renderSwitch();
    tabs()[0]?.focus();
    press('Tab');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('marks the vertical variant with aria-orientation="vertical"', () => {
    renderSwitch({ orientation: 'vertical' });
    expect(container.querySelector('[role="tablist"]')?.getAttribute('aria-orientation')).toBe(
      'vertical',
    );
  });

  it('keeps toggle mode a plain group of independently tabbable buttons', () => {
    const onToggle = vi.fn();
    const onChange = vi.fn();
    act(() => {
      root.render(
        <SegmentedSwitch
          layoutId="test-toggles"
          tabs={TABS}
          activeId="all"
          onChange={onChange}
          onToggle={onToggle}
          toggleIds={['frames']}
          activeToggleIds={[]}
          showOnlyActiveTabText={false}
        />,
      );
    });

    expect(container.querySelector('[role="group"]')).not.toBeNull();
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button'));
    expect(buttons.every((button) => button.tabIndex === 0)).toBe(true);

    buttons[0]?.focus();
    press('ArrowRight');
    expect(onChange).not.toHaveBeenCalled();
  });
});
