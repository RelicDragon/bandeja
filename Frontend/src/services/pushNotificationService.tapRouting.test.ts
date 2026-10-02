import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Every push the backend can send must land somewhere when tapped. A type with
 * no `handleNotificationTap` case silently opens the app on whatever screen was
 * last shown — which is how "Settle your share" shipped without a destination.
 */

const nav = vi.hoisted(() => ({
  isReady: vi.fn(() => true),
  navigateToGame: vi.fn(),
  navigateToPath: vi.fn(),
  navigateToLeagueSeasonSchedule: vi.fn(),
  navigateToUserChat: vi.fn(),
  navigateToUserTeam: vi.fn(),
  navigateToGroupChat: vi.fn(),
  navigateToChannelChat: vi.fn(),
  navigateToBugChat: vi.fn(),
  navigateToBugsList: vi.fn(),
  navigateToHome: vi.fn(),
  navigateToFind: vi.fn(),
  navigateToProfile: vi.fn(),
  navigateToWallet: vi.fn(),
  navigateToMarketplace: vi.fn(),
}));

vi.mock('./navigationService', () => ({ navigationService: nav }));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
  registerPlugin: () => ({}),
}));

vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    addListener: vi.fn(async () => undefined),
    removeAllListeners: vi.fn(async () => undefined),
  },
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: { getState: () => ({ isAuthenticated: false, isInitializing: false }) },
}));

vi.mock('@/api/axios', () => ({ default: { post: vi.fn() } }));

vi.mock('@/services/push/pushTapBridge', () => ({
  addPendingPushTapListener: vi.fn(async () => undefined),
  consumePendingPushTapNative: vi.fn(async () => undefined),
}));

function backendNotificationTypes(): string[] {
  const src = readFileSync(
    join(process.cwd(), '../Backend/src/types/notifications.types.ts'),
    'utf8',
  );
  const body = src.match(/export enum NotificationType \{([\s\S]*?)\n\}/)?.[1] ?? '';
  return [...body.matchAll(/^\s*([A-Z_]+)\s*=/gm)].map((m) => m[1]);
}

/** Every key any tap case reads, so each type can find what it needs. */
const FULL_PAYLOAD = {
  gameId: 'game-1',
  sourceGameId: 'game-0',
  proposalId: 'proposal-1',
  playIntentId: 'intent-1',
  recapMonthKey: '2026-09',
  weatherDeepLink: '/games/game-1?section=weather',
  bugId: 'bug-1',
  marketItemId: 'item-1',
  teamId: 'team-1',
  transactionId: 'tx-1',
  groupChannelId: 'channel-1',
  userChatId: 'chat-1',
  chatContextType: 'USER',
  contextId: 'ctx-1',
  messageId: 'msg-1',
};

async function tap(type: string, data: Record<string, unknown>) {
  const { default: service } = await import('./pushNotificationService');
  await (
    service as unknown as {
      handleNotificationAction: (action: unknown) => Promise<void>;
    }
  ).handleNotificationAction({ actionId: 'tap', notification: { id: 'n', data: { type, ...data } } });
}

function navCallCount(): number {
  return Object.entries(nav)
    .filter(([name]) => name !== 'isReady')
    .reduce((sum, [, fn]) => sum + fn.mock.calls.length, 0);
}

describe('push tap routing', () => {
  // Cold import of the service graph takes seconds on CI; keep it out of the first case's 5s budget.
  beforeAll(async () => {
    await import('./pushNotificationService');
  }, 60_000);

  beforeEach(() => {
    vi.clearAllMocks();
    nav.isReady.mockReturnValue(true);
  });

  it.each(backendNotificationTypes())('%s navigates somewhere on tap', async (type) => {
    await tap(type, FULL_PAYLOAD);
    expect(navCallCount()).toBeGreaterThan(0);
  });

  it('opens the game cost card with the settle sheet for a cost reminder', async () => {
    await tap('GAME_COST_REMINDER', { gameId: 'game-42', entityType: 'GAME' });
    expect(nav.navigateToPath).toHaveBeenCalledWith('/games/game-42?section=cost&settle=1');
  });

  it('opens the live game for a followed-player live push', async () => {
    await tap('FOLLOWED_USER_LIVE', { gameId: 'game-7' });
    expect(nav.navigateToGame).toHaveBeenCalledWith('game-7');
  });

  it('opens the story on Home for a story like push', async () => {
    await tap('USER_CHAT', {
      sourceType: 'USER_STORY_ITEM',
      sourceId: 'item-9',
      ownerUserId: 'me',
      userId: 'actor',
    });
    expect(nav.navigateToHome).toHaveBeenCalledWith({
      story: 'me',
      storySegment: 'USER_STORY_ITEM:item-9',
    });
    expect(nav.navigateToUserChat).not.toHaveBeenCalled();
  });

  it('opens the shop for a received gift', async () => {
    await tap('GOODS_GIFT_RECEIVED', { goodsId: 'goods-1', senderUserId: 'u-1' });
    expect(nav.navigateToPath).toHaveBeenCalledWith('/shop');
  });
});
