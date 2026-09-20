// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (options && 'name' in options) return `${key}:${String(options.name)}`;
      if (options && 'count' in options) return `${key}:${String(options.count)}`;
      return key;
    },
    i18n: { language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

let authToken: string | null = null;
vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ token: authToken }),
}));

const statusMock = vi.fn();
vi.mock('@/features/referral/useReferral', () => ({
  useReferralStatus: () => statusMock(),
  useSubmitReferralCode: () => ({ mutateAsync: vi.fn() }),
}));

let capturedCode: string | null = null;
vi.mock('@/utils/appAttribution', () => ({
  getCapturedReferralCode: () => capturedCode,
  captureManualReferralCode: (code: string) => code,
}));

// `@/api/referral` pulls in the axios instance (interceptors, Capacitor
// bridges); the banner only ever calls it through the mocked `useQuery`.
vi.mock('@/api/referral', () => ({
  referralApi: { resolvePublic: vi.fn(), submitCode: vi.fn() },
}));

const publicQueryMock = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => publicQueryMock(),
}));

vi.mock('@/components/motion/AnimatedPresencePanel', () => ({
  AnimatedPresencePanel: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

import { ReferralCaptureBanner } from './ReferralCaptureBanner';

/**
 * PRD 351 — the Register / Welcome banner.
 *
 * Four states, and the important one is the last: after seven days the code
 * field is gone and replaced by a caption, so a user is never invited to type
 * something that can no longer be accepted.
 */

let container: HTMLDivElement;
let root: Root;

function render() {
  act(() => {
    root.render(<ReferralCaptureBanner />);
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  authToken = null;
  capturedCode = null;
  statusMock.mockReturnValue({ data: undefined });
  publicQueryMock.mockReturnValue({ data: undefined });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('ReferralCaptureBanner, signed out (Register)', () => {
  it('shows the referrer once a captured code resolves', () => {
    capturedCode = 'BNDJ7K2Q';
    publicQueryMock.mockReturnValue({ data: { found: true, firstName: 'Marko', avatar: null } });
    render();
    expect(container.textContent).toContain('referral.invitedBy:Marko');
    expect(container.textContent).toContain('referral.bannerRewardGeneric');
  });

  it('falls back to a generic name when the referrer has none', () => {
    capturedCode = 'BNDJ7K2Q';
    publicQueryMock.mockReturnValue({ data: { found: true, firstName: null, avatar: null } });
    render();
    expect(container.textContent).toContain('referral.invitedBy:referral.aFriend');
  });

  it('offers the collapsed "Have a code?" link when nothing was captured', () => {
    render();
    expect(container.textContent).toContain('referral.haveACode');
    expect(container.querySelector('#referral-code-input')).toBeNull();
  });

  it('expands into the code field on tap', () => {
    render();
    const link = container.querySelector('button');
    act(() => {
      link?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('#referral-code-input')).not.toBeNull();
  });

  it('shows the link, not the banner, when the code does not resolve', () => {
    capturedCode = 'BNDJ7K2Q';
    publicQueryMock.mockReturnValue({ data: { found: false, firstName: null, avatar: null } });
    render();
    expect(container.textContent).toContain('referral.haveACode');
    expect(container.textContent).not.toContain('referral.invitedBy');
  });
});

describe('ReferralCaptureBanner, signed in (Welcome step)', () => {
  beforeEach(() => {
    authToken = 'tok';
  });

  it('shows the referrer and the exact reward the server quoted', () => {
    statusMock.mockReturnValue({
      data: {
        referrer: { firstName: 'Marko', avatar: null },
        canEnterCode: false,
        windowClosed: false,
        referredReward: 25,
      },
    });
    render();
    expect(container.textContent).toContain('referral.invitedBy:Marko');
    expect(container.textContent).toContain('referral.bannerReward:25');
  });

  it('offers the code field while the 7-day window is open', () => {
    statusMock.mockReturnValue({
      data: { referrer: null, canEnterCode: true, windowClosed: false, referredReward: 25 },
    });
    render();
    expect(container.textContent).toContain('referral.haveACode');
  });

  it('hides the field and explains why once the window has closed', () => {
    statusMock.mockReturnValue({
      data: { referrer: null, canEnterCode: false, windowClosed: true, referredReward: 25 },
    });
    render();
    expect(container.textContent).toContain('referral.windowClosedCaption');
    expect(container.textContent).not.toContain('referral.haveACode');
    expect(container.querySelector('#referral-code-input')).toBeNull();
  });

  it('renders nothing while the status is still loading', () => {
    statusMock.mockReturnValue({ data: undefined });
    render();
    expect(container.textContent).toBe('');
  });
});
