// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CostShare, GameCostSummary } from '@/api/gameCost';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const query = vi.hoisted(() => ({ data: undefined as GameCostSummary | undefined }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      `${key}|${options ? JSON.stringify(options) : ''}`,
    i18n: { language: 'en' },
  }),
}));
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/games/g1', search: '' }),
  useNavigate: () => vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@/config/featureFlags', () => ({ isCostSplitEnabled: () => true }));
vi.mock('@/store/socketEventsStore', () => ({ useSocketEventsStore: () => null }));
vi.mock('@/hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => true }));
vi.mock('@/components/PlayerAvatar', () => ({ PlayerAvatar: () => <span data-avatar="" /> }));
vi.mock('./CostSettleSheet', () => ({ CostSettleSheet: () => null }));
vi.mock('./CostShareEditSheet', () => ({ CostShareEditSheet: () => null }));
vi.mock('@/queries/useGameCostQuery', () => ({
  useGameCostQuery: () => ({ data: query.data, isPending: false, isError: false }),
  useGameCostMutations: () => {
    const mutation = { mutate: vi.fn(), isPending: false };
    return { markPaid: mutation, confirm: mutation, update: mutation, remind: mutation };
  },
}));

import { GameCostCard } from './GameCostCard';

const shares: CostShare[] = ['Marko', 'Ana', 'Ivo', 'Lea'].map((name, index) => ({
  userId: name,
  user: { id: name, firstName: name, lastName: '', avatar: null, level: 3, socialLevel: 3, gender: 'MALE', approvedLevel: true, isTrainer: false },
  amountMinor: 1000,
  currency: 'EUR',
  state: index === 0 || index === 3 ? 'SETTLED' : 'UNPAID',
  markedPaidAt: null,
  confirmedAt: null,
  method: 'MANUAL',
  transactionId: null,
  isPayer: index === 0,
  isOverridden: false,
}));

function summary(overrides: Partial<GameCostSummary> = {}): GameCostSummary {
  return {
    gameId: 'g1', available: true, totalMinor: 4000, currency: 'EUR',
    payerUserId: 'Marko', payer: shares[0].user, paymentHint: null, paymentMethods: [],
    countryIso2: null, frozenAt: null, estimated: true, shares,
    settledCount: 2, shareCount: 4, outstandingMinor: 2000, viewerShare: shares[1],
    canManage: false, canConfirm: false, canRemind: false, coinsPerCurrencyUnit: null,
    viewerCoinCost: null, viewerCoinBalance: 0, remindAvailableAt: null,
    ...overrides,
  };
}

describe('Cost card role visibility', () => {
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
  function render(data = summary(), viewer = 'Ana') {
    query.data = data;
    act(() => root.render(<GameCostCard gameId="g1" viewerUserId={viewer} />));
  }

  it('shows only the regular player’s share and the full settled count, even with an old full payload', () => {
    render();
    expect(container.querySelectorAll('li')).toHaveLength(1);
    expect(container.textContent).toContain('Ana');
    for (const name of ['Marko', 'Ivo', 'Lea']) expect(container.textContent).not.toContain(name);
    expect(container.textContent).toContain('€10.00');
    expect(container.textContent).toContain('cost.summaryAllSettled|{"settled":2,"total":4}');
    expect(container.textContent).not.toContain('€40.00');
    expect(container.textContent).not.toContain('€20.00');
    expect(container.textContent).toContain('cost.iPaid');
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
  });

  it('shows four player rows to organizers without paid-the-club chrome', () => {
    render(summary({ canManage: true, canConfirm: true, canRemind: true }));
    expect(container.querySelectorAll('li')).toHaveLength(4);
    expect(container.textContent).toContain('cost.summaryStrip|{"settled":2,"total":4,"amount":"€20.00"}');
    expect(container.textContent).toContain('€40.00');
    expect(container.textContent).not.toContain('cost.payerTag');
    expect(container.innerHTML).not.toContain('cost.paidBy');
    expect(container.querySelectorAll('[data-avatar]')).toHaveLength(4);
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(3);
  });

  it('renders a redacted response with one row and aggregate counts', () => {
    render(summary({ shares: [shares[1]], totalMinor: null, outstandingMinor: null }));
    expect(container.querySelectorAll('li')).toHaveLength(1);
    expect(container.textContent).toContain('cost.summaryAllSettled|{"settled":2,"total":4}');
    expect(container.textContent).toContain('cost.iPaid');
  });

  it('still shows the counts when an eligible player has no frozen share', () => {
    render(summary({ shares: [], viewerShare: null, totalMinor: null, outstandingMinor: null }));
    expect(container.querySelectorAll('li')).toHaveLength(0);
    expect(container.textContent).toContain('cost.summaryAllSettled|{"settled":2,"total":4}');
    expect(container.textContent).not.toContain('cost.iPaid');
  });

  it('keeps collection controls for a payer and removes editing after final', () => {
    render(summary({
      canManage: true, canConfirm: true, viewerShare: shares[0],
      frozenAt: '2026-09-22T00:00:00Z',
    }), 'Marko');
    expect(container.querySelectorAll('li')).toHaveLength(4);
    expect(container.textContent).not.toContain('cost.iPaid');
    expect(container.querySelectorAll('button[aria-label^="cost.editShareFor"]')).toHaveLength(0);
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(3);
  });
});
