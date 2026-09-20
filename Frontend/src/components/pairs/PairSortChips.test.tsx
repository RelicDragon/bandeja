// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  // Something in the import graph reaches `@/i18n/config`, which calls
  // `i18n.use(initReactI18next)` at module load; the mock must carry it.
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import type { PairSort } from '@/api/pairs';
import { PairSortChips } from './PairSortChips';

let container: HTMLDivElement;
let root: Root;
let selected: PairSort[];

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  selected = [];
  document.documentElement.dir = 'ltr';
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.documentElement.dir = 'ltr';
});

function render(value: PairSort) {
  act(() => {
    root.render(<PairSortChips value={value} onChange={(next) => selected.push(next)} />);
  });
}

function chips(): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
}

function press(key: string) {
  const group = container.querySelector<HTMLElement>('[role="radiogroup"]')!;
  act(() => {
    group.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

describe('PairSortChips (PRD 352)', () => {
  it('is a radio group of Win rate, Games and Level with win rate default', () => {
    render('winRate');
    const group = container.querySelector('[role="radiogroup"]')!;
    expect(group.getAttribute('aria-label')).toBe('pairs.sort.label');
    expect(chips().map((chip) => chip.textContent)).toEqual([
      'pairs.sort.winRate',
      'pairs.sort.games',
      'pairs.sort.level',
    ]);
    expect(chips().map((chip) => chip.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
    ]);
  });

  it('keeps exactly one tab stop', () => {
    render('games');
    expect(chips().map((chip) => chip.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('selects on click', () => {
    render('winRate');
    act(() => chips()[2]!.click());
    expect(selected).toEqual(['level']);
  });

  it('moves and selects with arrow keys, wrapping at the ends', () => {
    render('winRate');
    press('ArrowRight');
    expect(selected).toEqual(['games']);

    render('level');
    press('ArrowRight');
    expect(selected.at(-1)).toBe('winRate');

    render('winRate');
    press('ArrowLeft');
    expect(selected.at(-1)).toBe('level');
  });

  it('supports Home and End', () => {
    render('games');
    press('End');
    expect(selected.at(-1)).toBe('level');
    press('Home');
    expect(selected.at(-1)).toBe('winRate');
  });

  it('follows the reading direction in RTL', () => {
    document.documentElement.dir = 'rtl';
    render('winRate');
    // In `ar` the row starts on the right, so ArrowRight must move *back*,
    // which from the first chip wraps around to the last one.
    press('ArrowRight');
    expect(selected.at(-1)).toBe('level');
  });

  it('meets the 44 px tap target rule', () => {
    render('winRate');
    for (const chip of chips()) {
      expect(chip.className).toContain('min-h-[2.75rem]');
    }
  });
});
