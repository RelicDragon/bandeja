// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BasicUser } from '@/types';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}));

vi.mock('@/hooks/usePlayerCardModal', () => ({
  usePlayerCardModal: () => ({ openPlayerCard: vi.fn(), openPlayerAuthPrompt: vi.fn() }),
}));

vi.mock('@/features/collection/useEquippedGoods', () => ({
  useFrameClass: () => null,
  useNameColorClass: () => null,
  usePrefetchEquippedGoods: () => {},
}));

vi.mock('@/hooks/usePresenceSubscription', () => ({
  usePresenceSubscription: () => {},
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector?: (s: { user: null }) => unknown) =>
    selector ? selector({ user: null }) : { user: null },
}));

vi.mock('@/store/favoritesStore', () => ({
  useFavoritesStore: (selector: (s: { isFavorite: () => boolean }) => unknown) =>
    selector({ isFavorite: () => false }),
}));

vi.mock('@/store/presenceStore', () => ({
  usePresenceStore: (selector: (s: { isOnline: () => boolean }) => unknown) =>
    selector({ isOnline: () => false }),
}));

import { PlayerAvatar } from '@/components/PlayerAvatar';
import { NewcomerRankPill } from './NewcomerBadge';
import { NewPlayersBroughtStat } from './NewPlayersBroughtStat';

/** Shape of a roster user from `USER_SELECT_FIELDS` (PRD 358 adds the two novice fields). */
function rosterUser(overrides: Record<string, unknown> = {}): BasicUser {
  return {
    id: 'u-new',
    firstName: 'Nina',
    lastName: 'Novak',
    avatar: null,
    level: 1.5,
    socialLevel: 1,
    gender: 'FEMALE',
    approvedLevel: false,
    isTrainer: false,
    primarySport: 'PADEL',
    sportsEnabled: ['PADEL'],
    sportProfiles: [{ sport: 'PADEL', level: 1.5, reliability: 0, gamesPlayed: 1, gamesWon: 0 }],
    noviceRank: 1,
    noviceUnlockedAllAt: null,
    ...overrides,
  } as unknown as BasicUser;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(node: React.ReactNode) {
  act(() => root.render(node));
}

const badge = () => container.querySelector('[data-testid="newcomer-badge"]');

describe('🌱 newcomer badge in PlayerAvatar', () => {
  it('shows for a novice-mode user in the top-left badge slot', () => {
    render(<PlayerAvatar player={rosterUser()} smallLayout />);
    const el = badge();
    expect(el).not.toBeNull();
    expect(el?.className).toContain('-top-1 -left-1');
    expect(el?.className).toContain('w-5 h-5');
    expect(el?.getAttribute('aria-label')).toBe('novice.badge.newcomer');
  });

  it('is a corner glyph, never a ring or border on the avatar itself', () => {
    render(<PlayerAvatar player={rosterUser()} />);
    const avatarButton = container.querySelector('button');
    expect(avatarButton?.className ?? '').not.toMatch(/ring-|emerald/);
    expect(badge()?.parentElement).toBe(avatarButton);
  });

  it('sizes per avatar size', () => {
    render(<PlayerAvatar player={rosterUser()} extrasmall />);
    expect(badge()?.className).toContain('w-4 h-4');
    render(<PlayerAvatar player={rosterUser()} />);
    expect(badge()?.className).toContain('w-6 h-6');
  });

  it('is hidden at tiny / face-only sizes', () => {
    render(<PlayerAvatar player={rosterUser()} superTiny />);
    expect(badge()).toBeNull();
    render(<PlayerAvatar player={rosterUser()} inlineFace />);
    expect(badge()).toBeNull();
  });

  it('is hidden for Regulars, unlock-all users and payloads without novice fields', () => {
    render(<PlayerAvatar player={rosterUser({ noviceRank: 5 })} />);
    expect(badge()).toBeNull();
    render(<PlayerAvatar player={rosterUser({ noviceUnlockedAllAt: '2026-10-01T00:00:00.000Z' })} />);
    expect(badge()).toBeNull();
    render(<PlayerAvatar player={rosterUser({ noviceRank: undefined, noviceUnlockedAllAt: undefined })} />);
    expect(badge()).toBeNull();
  });

  it('shows at rank 0 (Newcomer)', () => {
    render(<PlayerAvatar player={rosterUser({ noviceRank: 0 })} />);
    expect(badge()).not.toBeNull();
  });

  it('moves to the top-right when the owner crown holds the top-left slot', () => {
    render(<PlayerAvatar player={rosterUser()} role="OWNER" />);
    expect(badge()?.className).toContain('-top-1 -right-1');
  });

  it('yields when crown and remove button hold both top slots', () => {
    render(<PlayerAvatar player={rosterUser()} role="OWNER" removable onRemoveClick={() => {}} />);
    expect(badge()).toBeNull();
  });

  it('can be opted out per avatar', () => {
    render(<PlayerAvatar player={rosterUser()} showNewcomerBadge={false} />);
    expect(badge()).toBeNull();
  });
});

describe('NewcomerRankPill (player card header)', () => {
  it('labels Newcomer + current rank', () => {
    render(<NewcomerRankPill user={rosterUser({ noviceRank: 2 })} />);
    const pill = container.querySelector('[data-testid="newcomer-rank-pill"]');
    expect(pill?.textContent).toContain('novice.badge.cardLabel');
    expect(pill?.textContent).toContain('novice.celebration.ranks.rookie');
  });

  it('says just Newcomer at rank 0 and hides for Regulars', () => {
    render(<NewcomerRankPill user={rosterUser({ noviceRank: 0 })} />);
    expect(container.textContent).toBe('novice.badge.newcomer');
    render(<NewcomerRankPill user={rosterUser({ noviceRank: 5 })} />);
    expect(container.querySelector('[data-testid="newcomer-rank-pill"]')).toBeNull();
  });
});

describe('NewPlayersBroughtStat (organizer)', () => {
  it('shows the count when positive', () => {
    render(<NewPlayersBroughtStat count={3} />);
    expect(container.textContent).toContain('novice.organizer.broughtPlayers');
    expect(container.textContent).toContain('"count":3');
  });

  it('hides at 0 or when the stat is missing', () => {
    render(<NewPlayersBroughtStat count={0} />);
    expect(container.querySelector('[data-testid="new-players-brought"]')).toBeNull();
    render(<NewPlayersBroughtStat count={undefined} />);
    expect(container.querySelector('[data-testid="new-players-brought"]')).toBeNull();
  });
});
