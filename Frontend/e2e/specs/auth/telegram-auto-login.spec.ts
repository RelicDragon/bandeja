import { expect, test, type Page, type Route } from '@playwright/test';

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function fakeAccessToken(): string {
  const now = Math.floor(Date.now() / 1000);
  return [
    base64UrlJson({ alg: 'none', typ: 'JWT' }),
    base64UrlJson({
      typ: 'access',
      userId: 'telegram-e2e-user',
      exp: now + 1800,
      iat: now,
      jti: 'telegram-e2e-jti',
      iss: 'padelpulse',
      aud: 'padelpulse-app',
      ver: 2,
    }),
    'sig',
  ].join('.');
}

function telegramUser() {
  return {
    id: 'telegram-e2e-user',
    firstName: 'Telegram',
    lastName: 'User',
    avatar: null,
    level: 1,
    socialLevel: 1,
    reliability: 0,
    totalPoints: 0,
    gamesPlayed: 0,
    gamesWon: 0,
    gender: 'PREFER_NOT_TO_SAY',
    genderIsSet: true,
    approvedLevel: false,
    isTrainer: false,
    telegramId: 'telegram-e2e-id',
    telegramUsername: 'telegram_e2e',
    language: 'en-GB',
    timeFormat: '24h',
    weekStart: 'monday',
    defaultCurrency: 'EUR',
    nameIsSet: true,
    primarySportIsSet: true,
    cityIsSet: true,
    primarySport: 'PADEL',
    sportsEnabled: ['PADEL'],
    sportProfiles: [{ sport: 'PADEL', level: 1, reliability: 0, gamesPlayed: 0, gamesWon: 0 }],
    currentCityId: 'telegram-e2e-city',
    currentCity: {
      id: 'telegram-e2e-city',
      name: 'Belgrade',
      country: 'RS',
      timezone: 'Europe/Belgrade',
      isActive: true,
    },
    wallet: 0,
    blockedUserIds: [],
    showOnlineStatus: true,
  };
}

function api(data: unknown) {
  return { success: true, data };
}

async function mockTelegramLoginBoot(page: Page): Promise<{ getVerifyCount: () => number }> {
  let verifyCount = 0;
  const user = telegramUser();

  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    (window as Window & { __E2E_VERSION_CHECK__?: { status: 'ok' } }).__E2E_VERSION_CHECK__ = {
      status: 'ok',
    };
  });

  await page.route('**/*', async (route: Route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) {
      await route.continue();
      return;
    }

    const path = url.pathname.replace(/^\/api/, '');
    let body: unknown;

    if (path === '/telegram/verify-link-key') {
      verifyCount += 1;
      body = api({
        user,
        token: fakeAccessToken(),
        refreshToken: 'telegram-e2e-refresh',
        currentSessionId: 'telegram-e2e-session',
      });
    } else if (path === '/users/profile') {
      body = api(user);
    } else if (path === '/chat/user-chats') {
      body = api([]);
    } else if (path === '/me/my-tab-data') {
      body = api({
        games: [],
        invites: [],
        teams: [],
        unreadCounts: {},
        storiesCount: 0,
        booktimeConnected: false,
        _meta: { timestamp: new Date().toISOString() },
      });
    } else if (path === '/chat/unread-objects') {
      body = api({
        games: [],
        userChats: [],
        groupChannels: [],
        bugs: [],
        marketItems: [],
        byContext: {},
        groupChannelMeta: {},
      });
    } else if (path === '/users/me/reaction-emoji-usage') {
      body = api({ items: [], version: 1 });
    } else if (path === '/ads/placements') {
      body = api({ placements: {} });
    } else if (path === '/stories/feed') {
      body = api({ serverTime: new Date().toISOString(), bubbles: [] });
    } else if (path === '/booktime/my-clubs') {
      body = api({ cityBooktimeClubCount: 0, connectedCount: 0, clubs: [] });
    } else if (path === '/users/notification-preferences') {
      body = api([]);
    } else if (path === '/users/me/sport-activity') {
      body = api([]);
    } else if (/\/users\/me\/sports\/[^/]+\/questionnaire\/status$/.test(path)) {
      body = api({ completed: false, skipped: false, suggested: false, level: 1, gamesPlayed: 0 });
    } else if (
      path === '/favorites/users' ||
      path === '/invites/my-invites' ||
      path === '/games/past-games' ||
      path === '/user-teams' ||
      path === '/user-teams/memberships'
    ) {
      body = api([]);
    } else if (path.includes('/unread-counts') || path === '/chat/sync/batch-head') {
      body = api({});
    } else {
      body = api({});
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  return { getVerifyCount: () => verifyCount };
}

test.describe('telegram auto-login', () => {
  test('verifies the link only once while auth/i18n state changes', async ({ page }) => {
    const boot = await mockTelegramLoginBoot(page);

    await page.goto('/login/550e8400-e29b-41d4-a716-446655440000');
    await page.waitForTimeout(1500);

    expect(boot.getVerifyCount()).toBe(1);
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(page.locator('.animate-splash-logo')).toHaveCount(0);
  });
});
