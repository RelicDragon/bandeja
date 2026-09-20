// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CostShare, GameCostSummary } from '@/api/gameCost';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && 'coins' in options ? `${key}:${String(options.coins)}` : key,
    i18n: { language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/useBackButtonModal', () => ({ useBackButtonModal: () => {} }));

vi.mock('@/components/ui/Drawer', () => ({
  Drawer: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="sheet">{children}</div> : null,
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DrawerDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

import { CostSettleSheet } from './CostSettleSheet';

/**
 * PRD 348 — the two branches of "How did you pay?", and nothing else.
 *
 * The coin branch must be impossible to reach when the platform rate is unset
 * or the viewer cannot afford it: that is the guard that keeps a hard product
 * constraint (no money movement outside the existing coin transfer) honest.
 */

const viewerShare: CostShare = {
  userId: 'ana',
  user: null,
  amountMinor: 1000,
  currency: 'EUR',
  state: 'UNPAID',
  markedPaidAt: null,
  confirmedAt: null,
  method: 'MANUAL',
  transactionId: null,
  isPayer: false,
  isOverridden: false,
};

function summary(overrides: Partial<GameCostSummary> = {}): GameCostSummary {
  return {
    gameId: 'g1',
    available: true,
    totalMinor: 4000,
    currency: 'EUR',
    payerUserId: 'marko',
    payer: { id: 'marko', firstName: 'Marko', lastName: 'P', avatar: null, level: 3, socialLevel: 3, gender: 'MALE', approvedLevel: true, isTrainer: false },
    paymentHint: null,
    frozenAt: null,
    estimated: true,
    shares: [viewerShare],
    settledCount: 0,
    shareCount: 4,
    outstandingMinor: 4000,
    viewerShare,
    canManage: false,
    canConfirm: false,
    canRemind: false,
    coinsPerCurrencyUnit: null,
    viewerCoinCost: null,
    viewerCoinBalance: 0,
    remindAvailableAt: null,
    ...overrides,
  };
}

describe('CostSettleSheet', () => {
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

  function render(model: GameCostSummary, onSettle = vi.fn()) {
    act(() => {
      root.render(
        <CostSettleSheet
          open
          onOpenChange={() => {}}
          summary={model}
          pending={false}
          onSettle={onSettle}
        />,
      );
    });
    return onSettle;
  }

  function buttonWithText(text: string): HTMLButtonElement | undefined {
    return [...container.querySelectorAll('button')].find((node) =>
      node.textContent?.includes(text),
    ) as HTMLButtonElement | undefined;
  }

  it('always offers the outside-the-app branch', () => {
    const onSettle = render(summary());
    const button = buttonWithText('cost.sheet.outside');
    expect(button).toBeDefined();
    act(() => {
      button?.click();
    });
    expect(onSettle).toHaveBeenCalledWith('MANUAL');
  });

  it('hides the coin branch while COINS_PER_CURRENCY_UNIT is unset', () => {
    render(summary());
    expect(buttonWithText('cost.sheet.coins')).toBeUndefined();
  });

  it('hides the coin branch when the viewer cannot afford it', () => {
    render(
      summary({ coinsPerCurrencyUnit: 100, viewerCoinCost: 1000, viewerCoinBalance: 999 }),
    );
    expect(buttonWithText('cost.sheet.coins')).toBeUndefined();
  });

  it('offers the coin branch once the rate is set and the balance covers it', () => {
    const onSettle = render(
      summary({ coinsPerCurrencyUnit: 100, viewerCoinCost: 1000, viewerCoinBalance: 1000 }),
    );
    const button = buttonWithText('cost.sheet.coins:1000');
    expect(button).toBeDefined();
    act(() => {
      button?.click();
    });
    expect(onSettle).toHaveBeenCalledWith('COINS');
  });

  it('shows the payer’s payment hint in a copyable field', () => {
    render(summary({ paymentHint: 'IBAN RS35 1234' }));
    expect(container.textContent).toContain('IBAN RS35 1234');
    expect(container.querySelector('button[aria-label="cost.sheet.copy"]')).not.toBeNull();
  });

  it('renders nothing when the viewer has no share', () => {
    render(summary({ viewerShare: null }));
    expect(container.querySelector('[data-testid="sheet"]')).toBeNull();
  });
});
