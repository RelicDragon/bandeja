// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReferralSummary } from '@/api/referral';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && 'count' in options
        ? `${key}:${String(options.count)}`
        : options && 'code' in options
          ? `${key}:${String(options.code)}`
          : key,
    i18n: { language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const shareMock = vi.fn(async () => 'shared' as const);
const summaryMock = vi.fn();

vi.mock('@/features/referral/useReferral', () => ({
  useReferralSummary: () => summaryMock(),
  useShareReferral: () => ({ share: shareMock, busy: false }),
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { firstName: 'Ana', avatar: null }, token: 'tok' }),
}));

const copyMock = vi.fn(async () => true);
vi.mock('@/features/referral/shareReferral', () => ({
  copyTextToClipboard: (text: string) => copyMock(text),
}));

// The real one pulls in framer-motion and the whole `@/components` barrel for
// a decorative card; the invite list only cares that it renders the copy.
vi.mock('@/components/home/EmptyStateCard', () => ({
  EmptyStateCard: ({ title, description }: { title: string; description?: string }) => (
    <div>
      <p>{title}</p>
      <p>{description}</p>
    </div>
  ),
}));

import { InviteFriendsCard } from './InviteFriendsCard';

/**
 * PRD 351 — the invite card's four states: loading, normal, cap reached, and
 * the empty invites list. The cap case is the one with a real product rule
 * behind it: the share button must survive it.
 */

function summary(overrides: Partial<ReferralSummary> = {}): ReferralSummary {
  return {
    code: 'BNDJ7K2Q',
    displayCode: 'BNDJ-7K2Q',
    link: 'https://bandeja.me/link-to-app/?ref=BNDJ-7K2Q',
    referrerReward: 50,
    referredReward: 25,
    rewardedCount: 3,
    cap: 50,
    capReached: false,
    invites: [],
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

function render() {
  act(() => {
    root.render(<InviteFriendsCard />);
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  shareMock.mockClear();
  copyMock.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('InviteFriendsCard', () => {
  it('shows a skeleton while the summary loads', () => {
    summaryMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render();
    expect(container.querySelector('button')).toBeNull();
    expect(container.innerHTML).toContain('animate-shimmer');
  });

  it('renders nothing when the summary fails, rather than breaking Profile', () => {
    summaryMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render();
    expect(container.textContent).toBe('');
  });

  it('shows the headline, subline and code pill', () => {
    summaryMock.mockReturnValue({ data: summary(), isLoading: false, isError: false });
    render();
    expect(container.textContent).toContain('referral.cardHeadline:50');
    expect(container.textContent).toContain('referral.cardSubline:25');
    expect(container.textContent).toContain('BNDJ-7K2Q');
  });

  it('labels the code pill with a spelled-out code for screen readers', () => {
    summaryMock.mockReturnValue({ data: summary(), isLoading: false, isError: false });
    render();
    const pill = container.querySelector('[aria-label^="referral.copyCodeAria"]');
    expect(pill).not.toBeNull();
    expect(pill?.getAttribute('aria-label')).toBe('referral.copyCodeAria:B N D J 7 K 2 Q');
  });

  it('shares the personal link from the primary action', async () => {
    summaryMock.mockReturnValue({ data: summary(), isLoading: false, isError: false });
    render();
    const buttons = [...container.querySelectorAll('button')];
    const shareButton = buttons.find((b) => b.textContent?.includes('referral.shareInvite'));
    expect(shareButton).toBeDefined();
    await act(async () => {
      shareButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(shareMock).toHaveBeenCalledWith(
      'https://bandeja.me/link-to-app/?ref=BNDJ-7K2Q',
      expect.stringContaining('referral.shareMessage'),
    );
  });

  it('copies the code from the pill', async () => {
    summaryMock.mockReturnValue({ data: summary(), isLoading: false, isError: false });
    render();
    const pill = container.querySelector<HTMLButtonElement>('[aria-label^="referral.copyCodeAria"]');
    await act(async () => {
      pill?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(copyMock).toHaveBeenCalledWith('BNDJ-7K2Q');
  });

  it('keeps the share button when the cap is reached', () => {
    summaryMock.mockReturnValue({
      data: summary({ capReached: true, rewardedCount: 50 }),
      isLoading: false,
      isError: false,
    });
    render();
    expect(container.textContent).toContain('referral.capReached:50');
    const shareButton = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('referral.shareInvite'),
    );
    expect(shareButton).toBeDefined();
    expect(shareButton?.disabled).toBe(false);
  });

  it('shows the empty state with no invites', () => {
    summaryMock.mockReturnValue({ data: summary(), isLoading: false, isError: false });
    render();
    expect(container.textContent).toContain('referral.emptyTitle');
    expect(container.textContent).toContain('referral.emptyDescription');
  });

  it('lists invites with a labelled state chip each', () => {
    summaryMock.mockReturnValue({
      data: summary({
        invites: [
          { id: 'a1', state: 'INVITED', user: null, at: '2026-03-03T00:00:00.000Z', rewardCoins: null },
          {
            id: 'u2',
            state: 'JOINED',
            user: { id: 'u2', firstName: 'Marko', lastName: null, avatar: null },
            at: '2026-03-02T00:00:00.000Z',
            rewardCoins: null,
          },
          {
            id: 'u3',
            state: 'PLAYED',
            user: { id: 'u3', firstName: 'Ana', lastName: 'Ilic', avatar: null },
            at: '2026-03-01T00:00:00.000Z',
            rewardCoins: 50,
          },
        ],
      }),
      isLoading: false,
      isError: false,
    });
    render();
    expect(container.textContent).toContain('referral.pending');
    expect(container.textContent).toContain('referral.chipInvited');
    expect(container.textContent).toContain('Marko');
    expect(container.textContent).toContain('referral.chipJoined');
    expect(container.textContent).toContain('Ana Ilic');
    expect(container.textContent).toContain('referral.chipPlayed · +50');
    expect(container.textContent).not.toContain('referral.emptyTitle');
  });
});
