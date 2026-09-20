// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OwedCostShare, OwedSummary } from '@/api/gameCost';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  data: undefined as OwedSummary | undefined,
  navigated: [] as string[],
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => (to: string) => state.navigated.push(to),
}));

vi.mock('@/queries/useGameCostQuery', () => ({
  useOwedSharesQuery: () => ({ data: state.data }),
}));

vi.mock('@/components/PlayerAvatar', () => ({
  PlayerAvatar: () => <span data-testid="avatar" />,
}));

import { WalletOwedSections } from './WalletOwedSections';

/** PRD 348 — the Wallet's two outstanding-share lists. */
function row(overrides: Partial<OwedCostShare> = {}): OwedCostShare {
  return {
    gameId: 'g1',
    gameName: 'Tuesday padel',
    startTime: '2026-02-03T18:00:00.000Z',
    amountMinor: 1000,
    currency: 'EUR',
    state: 'UNPAID',
    counterparty: null,
    counterpartyUserId: 'marko',
    ...overrides,
  };
}

describe('WalletOwedSections', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    state.data = undefined;
    state.navigated = [];
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render() {
    act(() => {
      root.render(<WalletOwedSections />);
    });
  }

  it('renders nothing before the query resolves', () => {
    render();
    expect(container.textContent).toBe('');
  });

  it('shows the empty state when nothing is outstanding either way', () => {
    state.data = { owed: [], owedToMe: [] };
    render();
    expect(container.textContent).toContain('cost.wallet.allSettled');
  });

  it('lists what the viewer owes with a Settle action', () => {
    state.data = { owed: [row()], owedToMe: [] };
    render();
    expect(container.textContent).toContain('Tuesday padel');
    expect(container.textContent).toContain('€10.00');
    expect(container.textContent).toContain('cost.wallet.settle');
    expect(container.textContent).not.toContain('cost.wallet.owedToYou');
  });

  it('deep-links Settle straight into the game’s settle sheet', () => {
    state.data = { owed: [row()], owedToMe: [] };
    render();
    const settle = [...container.querySelectorAll('button')].find((node) =>
      node.textContent?.includes('cost.wallet.settle'),
    );
    act(() => {
      settle?.click();
    });
    expect(state.navigated).toEqual(['/games/g1?section=cost&settle=1']);
  });

  it('lists what others owe the viewer as payer', () => {
    state.data = { owed: [], owedToMe: [row({ counterpartyUserId: 'ana' })] };
    render();
    expect(container.textContent).toContain('cost.wallet.owedToYou');
    expect(container.textContent).toContain('cost.wallet.view');
    expect(container.textContent).not.toContain('cost.wallet.settle');
  });
});
