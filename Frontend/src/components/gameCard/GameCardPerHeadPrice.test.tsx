// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PerHeadPrice } from '@/types';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      `${key}|${options ? JSON.stringify(options) : ''}`,
    i18n: { language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import { GameCardPerHeadPrice } from './GameCardPerHeadPrice';

/** PRD 348 — the card reads "10 € per player", with the total one press away. */
describe('GameCardPerHeadPrice', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const price = (overrides: Partial<PerHeadPrice> = {}): PerHeadPrice => ({
    amountCents: 1000,
    currency: 'EUR',
    totalCents: 4000,
    payerCount: 4,
    estimated: true,
    ...overrides,
  });

  it('shows the estimated per-head figure before the game is final', () => {
    act(() => {
      root.render(<GameCardPerHeadPrice perHeadPrice={price()} />);
    });
    expect(container.textContent).toContain('cost.card.perPlayerEstimated');
    expect(container.textContent).toContain('€10.00');
  });

  it('drops the "approximately" wording once the shares are frozen', () => {
    act(() => {
      root.render(<GameCardPerHeadPrice perHeadPrice={price({ estimated: false })} />);
    });
    expect(container.textContent).toContain('cost.card.perPlayer|');
    expect(container.textContent).not.toContain('perPlayerEstimated');
  });

  it('keeps the total in the accessible name, not only behind a long press', () => {
    act(() => {
      root.render(<GameCardPerHeadPrice perHeadPrice={price()} />);
    });
    const label = container.firstElementChild?.getAttribute('aria-label') ?? '';
    expect(label).toContain('cost.card.totalFor');
    expect(label).toContain('€40.00');
    expect(label).toContain('€10.00');
    expect(container.firstElementChild?.getAttribute('title')).toContain('cost.card.totalFor');
  });

  it('carries the label on a real button, where name-from-author applies', () => {
    act(() => {
      root.render(<GameCardPerHeadPrice perHeadPrice={price()} />);
    });
    // `aria-label` is ignored on a generic `<span>`; only a role that supports
    // name-from-author (here: `button`) actually exposes it.
    const control = container.firstElementChild as HTMLElement | null;
    expect(control?.tagName).toBe('BUTTON');
    expect(control?.getAttribute('type')).toBe('button');
  });

  it('reveals the total on tap without letting the card click through', () => {
    // `GameCard` wraps the whole card in an onClick that routes to the game;
    // the price control must swallow its own press.
    const cardClick = vi.fn();
    act(() => {
      root.render(
        <div onClick={cardClick}>
          <GameCardPerHeadPrice perHeadPrice={price()} />
        </div>,
      );
    });
    const control = container.querySelector('button');
    expect(control).not.toBeNull();

    act(() => {
      control?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(container.textContent).toContain('cost.card.totalFor');
    expect(cardClick).not.toHaveBeenCalled();
  });

  it('formats the game currency, never a converted one', () => {
    act(() => {
      root.render(
        <GameCardPerHeadPrice
          perHeadPrice={price({ currency: 'JPY', amountCents: 4000, totalCents: 16000 })}
        />,
      );
    });
    expect(container.textContent).toContain('¥4,000');
    expect(container.textContent).not.toContain('€');
  });
});
