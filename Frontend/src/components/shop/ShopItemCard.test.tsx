// @vitest-environment jsdom
import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShopItem } from '@/api/shop';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && 'formatted' in options ? `${options.formatted}|${key}` : key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: 'me', firstName: 'Ana', lastName: 'Ruiz', avatar: null } }),
}));

import { ShopItemCard } from './ShopItemCard';

function item(overrides: Partial<ShopItem> = {}): ShopItem {
  return {
    id: 'g1',
    kind: 'PROFILE_FRAME',
    name: 'Neon Frame',
    description: null,
    assetKey: 'frame-neon',
    previewUrl: null,
    price: 120,
    isFeatured: false,
    premiumOnly: false,
    sortOrder: 0,
    stickerPackId: null,
    owned: false,
    equipped: false,
    giftedByUserId: null,
    state: 'BUY',
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

function render(node: ReactElement): void {
  act(() => {
    root.render(node);
  });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('catalog card states', () => {
  it('offers Buy with the price pill for an unowned item', () => {
    render(<ShopItemCard item={item()} onOpen={() => {}} />);
    const button = container.querySelector('button');
    expect(button?.getAttribute('aria-label')).toBe('Neon Frame. 120|shop.coins. shop.buy.');
    // The price pill's accessible name is the whole phrase, not a bare number.
    expect(container.querySelector('[aria-label="120|shop.coins"]')).not.toBeNull();
  });

  it('carries the price in the card label, which overrides the rendered pill', () => {
    // An `aria-label` on a `<button>` replaces its whole subtree as the
    // accessible name, so the visible `ShopPricePill` is never announced.
    // Dropping the price from here means a shopper cannot compare prices at all.
    render(<ShopItemCard item={item({ price: 2500 })} onOpen={() => {}} />);
    // Prices are grouped per locale ("2,500" in en), so derive the expected
    // string rather than hard-coding a separator.
    const grouped = new Intl.NumberFormat('en').format(2500);
    expect(container.querySelector('button')?.getAttribute('aria-label')).toContain(
      `${grouped}|shop.coins`,
    );
  });

  it('reads as Owned once bought', () => {
    render(<ShopItemCard item={item({ owned: true, state: 'OWNED' })} onOpen={() => {}} />);
    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Neon Frame. 120|shop.coins. shop.owned.',
    );
  });

  it('reads as Equipped, not just a coloured tick', () => {
    render(
      <ShopItemCard
        item={item({ owned: true, equipped: true, state: 'EQUIPPED' })}
        onOpen={() => {}}
      />,
    );
    expect(container.textContent).toContain('shop.equipped');
    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Neon Frame. 120|shop.coins. shop.equipped.',
    );
  });

  it('shows the premium lock and the gold border for a premium-only item', () => {
    render(
      <ShopItemCard
        item={item({ premiumOnly: true, state: 'PREMIUM_LOCKED' })}
        onOpen={() => {}}
      />,
    );
    const button = container.querySelector('button');
    expect(button?.className).toContain('shop-premium-card');
    expect(button?.getAttribute('aria-label')).toBe(
      'Neon Frame. 120|shop.coins. shop.premiumOnly. shop.premium.',
    );
    // The gold badge reads from a token class, not a raw hex below 4.5:1.
    expect(container.querySelector('.shop-premium-badge')).not.toBeNull();
  });

  it('renders the frame ring class on the preview avatar', () => {
    render(<ShopItemCard item={item()} onOpen={() => {}} />);
    expect(container.querySelector('.collection-frame-neon')).not.toBeNull();
  });

  it('previews a chat accent on a bubble, not on an avatar ring', () => {
    render(
      <ShopItemCard
        item={item({ kind: 'CHAT_ACCENT', assetKey: 'accent-neon', name: 'Neon Chat' })}
        onOpen={() => {}}
      />,
    );
    expect(container.querySelector('.collection-accent-neon')).not.toBeNull();
    expect(container.querySelector('.collection-frame')).toBeNull();
  });

  it('gives the preview a text alternative', () => {
    render(<ShopItemCard item={item()} onOpen={() => {}} />);
    const preview = container.querySelector('[role="img"]');
    expect(preview?.getAttribute('aria-label')).toContain('shop.previewAlt');
  });

  it('opens the item sheet when tapped', () => {
    const onOpen = vi.fn();
    render(<ShopItemCard item={item()} onOpen={onOpen} />);
    act(() => {
      container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'g1' }));
  });
});
