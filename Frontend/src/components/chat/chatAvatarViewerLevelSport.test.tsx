// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BasicUser } from '@/types';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const avatarProps = vi.hoisted(() => ({
  last: null as Record<string, unknown> | null,
}));

const authState = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/components/PlayerAvatar', () => ({
  PlayerAvatar: (props: Record<string, unknown>) => {
    avatarProps.last = props;
    return <div data-testid="player-avatar" />;
  },
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector?: (s: { user: Record<string, unknown> | null }) => unknown) =>
    selector ? selector(authState) : authState,
}));

vi.mock('@/api/chat', () => ({
  getLastMessageTime: () => 0,
  isLastMessagePreview: () => false,
}));

vi.mock('@/i18n/config', () => ({
  default: {
    t: (key: string) => key,
    language: 'en',
    use: () => ({ init: () => {} }),
    changeLanguage: () => Promise.resolve(),
    on: () => {},
  },
}));

vi.mock('@/utils/displayPreferences', () => ({
  resolveDisplaySettings: () => ({ locale: 'en', hour12: false }),
}));

vi.mock('@/components/chat/ChatListOutboxAnimated', () => ({
  ChatListOutboxAnimated: () => null,
}));

import { CityUserCard } from './CityUserCard';
import { UserChatCard } from './UserChatCard';
import { Sports } from '@shared/sport';

const padelViewer = {
  id: 'viewer-1',
  primarySport: Sports.PADEL,
  sportsEnabled: [Sports.PADEL],
};

const tableTennisViewer = {
  id: 'viewer-2',
  primarySport: Sports.TABLE_TENNIS,
  sportsEnabled: [Sports.TABLE_TENNIS, Sports.PADEL],
};

const tableTennisPrimaryUser = {
  id: 'u1',
  firstName: 'Ann',
  lastName: 'Bee',
  primarySport: Sports.TABLE_TENNIS,
  sportsEnabled: [Sports.TABLE_TENNIS, Sports.PADEL],
  sportProfiles: [
    { sport: Sports.PADEL, level: 2.7, reliability: 50, gamesPlayed: 3, gamesWon: 1 },
    { sport: Sports.TABLE_TENNIS, level: 3.5, reliability: 60, gamesPlayed: 5, gamesWon: 2 },
  ],
} as unknown as BasicUser;

describe('chat avatar level badge uses the viewer default sport', () => {
  let root: Root | null = null;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    avatarProps.last = null;
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container.remove();
    root = null;
  });

  it('CityUserCard passes the padel viewer primary sport to the avatar', () => {
    authState.user = padelViewer;
    act(() => {
      root!.render(<CityUserCard user={tableTennisPrimaryUser} onClick={() => {}} />);
    });
    expect(avatarProps.last?.levelSport).toBe(Sports.PADEL);
  });

  it('CityUserCard passes the table tennis viewer primary sport to the avatar', () => {
    authState.user = tableTennisViewer;
    act(() => {
      root!.render(<CityUserCard user={tableTennisPrimaryUser} onClick={() => {}} />);
    });
    expect(avatarProps.last?.levelSport).toBe(Sports.TABLE_TENNIS);
  });

  it('UserChatCard badges the other user with the viewer primary sport', () => {
    authState.user = padelViewer;
    const chat = {
      id: 'chat-1',
      user1Id: 'viewer-1',
      user1: padelViewer,
      user2Id: 'u1',
      user2: tableTennisPrimaryUser,
      lastMessage: null,
    } as never;
    act(() => {
      root!.render(<UserChatCard chat={chat} />);
    });
    expect(avatarProps.last?.player).toBe(tableTennisPrimaryUser);
    expect(avatarProps.last?.levelSport).toBe(Sports.PADEL);
  });
});
