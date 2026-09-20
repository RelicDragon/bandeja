// @vitest-environment jsdom
import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShopCollection, ShopItem } from '@/api/shop';

const flags = vi.hoisted(() => ({ shopEnabled: true }));
const query = vi.hoisted(() => ({ data: undefined as ShopCollection | undefined, isLoading: false }));
const api = vi.hoisted(() => ({ equip: vi.fn(), unequip: vi.fn(), getCollection: vi.fn() }));
const nav = vi.hoisted(() => ({ navigate: vi.fn() }));
const store = vi.hoisted(() => ({ applyOwn: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => nav.navigate }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => query,
  useQueryClient: () => ({ invalidateQueries: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/config/featureFlags', () => ({ isShopEnabled: () => flags.shopEnabled }));
vi.mock('@/api/shop', () => ({ shopApi: api }));
vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: 'me', firstName: 'Ana', lastName: 'Ruiz', avatar: null } }),
}));
vi.mock('@/store/equippedGoodsStore', () => ({
  useEquippedGoodsStore: (selector: (state: unknown) => unknown) =>
    selector({ applyOwn: store.applyOwn }),
}));

import { CollectionSection } from './CollectionSection';

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
    owned: true,
    equipped: false,
    giftedByUserId: null,
    state: 'OWNED',
    ...overrides,
  };
}

function collection(items: ShopItem[]): ShopCollection {
  return {
    balance: 500,
    viewerIsPremium: false,
    items,
    equipped: { frame: null, nameColor: null, chatAccent: null },
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
  flags.shopEnabled = true;
  query.data = undefined;
  query.isLoading = false;
  api.equip.mockReset().mockResolvedValue({ frame: null, nameColor: null, chatAccent: null });
  api.unequip.mockReset().mockResolvedValue({ frame: null, nameColor: null, chatAccent: null });
  window.localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('Profile → Appearance → Collection', () => {
  it('renders nothing and fetches nothing when the shop flag is off', () => {
    flags.shopEnabled = false;
    render(<CollectionSection />);
    expect(container.innerHTML).toBe('');
  });

  it('invites the player to the shop when they own nothing', () => {
    query.data = collection([]);
    render(<CollectionSection />);
    expect(container.textContent).toContain('shop.collectionEmpty');
    expect(container.textContent).toContain('shop.getMoreStyles');
  });

  it('shows an owned item as a pressable tile', () => {
    query.data = collection([item()]);
    render(<CollectionSection />);
    const tile = container.querySelector('li button');
    expect(tile?.getAttribute('aria-pressed')).toBe('false');
    expect(tile?.getAttribute('aria-label')).toBe('Neon Frame. shop.tapToEquip');
  });

  it('marks the equipped item with a pressed state and a text label', () => {
    query.data = collection([item({ equipped: true, state: 'EQUIPPED' })]);
    render(<CollectionSection />);
    const tile = container.querySelector('li button');
    expect(tile?.getAttribute('aria-pressed')).toBe('true');
    expect(tile?.getAttribute('aria-label')).toBe('Neon Frame. shop.equipped');
  });

  it('equips on tap and unequips the second time', async () => {
    query.data = collection([item()]);
    render(<CollectionSection />);
    await act(async () => {
      container.querySelector('li button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(api.equip).toHaveBeenCalledWith('g1');
    expect(store.applyOwn).toHaveBeenCalled();

    query.data = collection([item({ equipped: true, state: 'EQUIPPED' })]);
    render(<CollectionSection />);
    await act(async () => {
      container.querySelector('li button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(api.unequip).toHaveBeenCalledWith('g1');
  });

  it('does not offer Equip on a sticker pack', () => {
    // Equipping a pack changed nothing anywhere: access comes from ownership.
    query.data = collection([
      item({ id: 'g9', kind: 'STICKER_PACK', name: 'Summer Pack', stickerPackId: 'pack-summer' }),
    ]);
    render(<CollectionSection />);
    expect(container.querySelector('li button')).toBeNull();
    const tile = container.querySelector('[data-testid="collection-unlocked-tile"]');
    expect(tile).not.toBeNull();
    expect(tile?.textContent).toContain('shop.stickerPackUnlocked');
  });

  it('sparkles a received gift once, then never again', () => {
    query.data = collection([item({ giftedByUserId: 'friend' })]);
    render(<CollectionSection />);
    expect(container.querySelector('.shop-sparkle')).not.toBeNull();

    act(() => root.unmount());
    root = createRoot(container);
    render(<CollectionSection />);
    expect(container.querySelector('.shop-sparkle')).toBeNull();
  });

  it('sends the player to the shop from "Get more styles"', () => {
    query.data = collection([]);
    render(<CollectionSection />);
    const buttons = [...container.querySelectorAll('button')];
    const link = buttons.find((button) => button.textContent === 'shop.getMoreStyles');
    act(() => {
      link?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(nav.navigate).toHaveBeenCalledWith('/shop');
  });
});
