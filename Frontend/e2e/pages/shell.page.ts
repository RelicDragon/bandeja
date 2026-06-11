import { expect, type Page } from '@playwright/test';

export type ShellTab = 'my' | 'find' | 'chats' | 'marketplace' | 'leaderboard';

export const TAB_LABELS: Record<ShellTab, RegExp> = {
  my: /^my$/i,
  find: /^find$/i,
  chats: /^chats$/i,
  marketplace: /^market$/i,
  leaderboard: /^top$/i,
};

const TAB_PATHS: Record<ShellTab, string> = {
  my: '/',
  find: '/find',
  chats: '/chats',
  marketplace: '/marketplace',
  leaderboard: '/leaderboard',
};

export class ShellPage {
  constructor(private readonly page: Page) {}

  bottomTabButtons() {
    return this.page.getByRole('button', {
      name: new RegExp(
        `^(${Object.values(TAB_LABELS)
          .map((label) => label.source.replace(/^\^|\$$/g, ''))
          .join('|')})$`,
        'i',
      ),
    });
  }

  async waitForShellReady() {
    await this.bottomTabButtons().first().waitFor({ state: 'visible', timeout: 45_000 });
  }

  async waitForChatsHeader() {
    await this.page.locator('header').getByRole('tablist').waitFor({ state: 'visible', timeout: 30_000 });
  }

  async expectAuthenticatedHome() {
    await this.page.goto('/');
    await expectUrlPath(this.page, '/');
    await this.expectBottomTabsVisible();
  }

  async expectGuestRedirectToLogin() {
    await this.page.goto('/');
    await expect(this.page).toHaveURL(/\/login/);
  }

  async expectAuthenticatedColdLoad() {
    await this.page.goto('/');
    await expectUrlPath(this.page, '/');
    await this.expectBottomTabsVisible();
  }

  async expectUnknownRouteRedirectsHome() {
    await this.page.goto('/foo');
    await expectUrlPath(this.page, '/');
  }

  async expectUnknownRouteRedirectsLogin() {
    await this.page.goto('/foo');
    await expect(this.page).toHaveURL(/\/login/);
  }

  async expectBottomTabsVisible() {
    await this.waitForShellReady();
    await expect(this.page.getByRole('button', { name: TAB_LABELS.marketplace })).toBeVisible();
    await expect(this.page.getByRole('button', { name: TAB_LABELS.leaderboard })).toBeVisible();
  }

  async gotoTab(path: '/' | '/find' | '/chats' | '/marketplace' | '/leaderboard' | '/profile') {
    await this.page.goto(path);
    await expectUrlPath(this.page, path);
  }

  async clickBottomTab(tab: ShellTab) {
    const button = this.page.getByRole('button', { name: TAB_LABELS[tab] });
    if (!(await button.isVisible())) {
      await this.page.goto(TAB_PATHS[tab]);
    } else {
      await button.click();
    }
    await this.expectTabRoute(tab);
  }

  async clickAllVisibleBottomTabs() {
    const order: ShellTab[] = ['find', 'chats', 'marketplace', 'leaderboard', 'my'];
    for (const tab of order) {
      const button = this.page.getByRole('button', { name: TAB_LABELS[tab] });
      if (!(await button.isVisible())) continue;
      await this.clickBottomTab(tab);
    }
  }

  async expectTabRoute(tab: ShellTab) {
    await expectUrlPath(this.page, TAB_PATHS[tab]);
  }

  async expectHomeSubtab(subtab: 'calendar' | 'past-games') {
    await this.waitForShellReady();
    const tablist = this.page.locator('header').getByRole('tablist').first();
    const label = subtab === 'calendar' ? /calendar/i : /past/i;
    await expect(tablist.getByRole('tab', { selected: true })).toContainText(label);
  }

  async expectChatsFilter(filter: 'users' | 'channels' | 'market' | 'bugs') {
    await this.waitForChatsHeader();
    const tablist = this.page.locator('header').getByRole('tablist').first();
    const labels: Record<typeof filter, RegExp> = {
      users: /chats/i,
      channels: /channels/i,
      market: /market/i,
      bugs: /bugs/i,
    };
    await expect(tablist.getByRole('tab', { selected: true })).toContainText(labels[filter]);
  }

  async simulatePullToRefresh() {
    await this.page.evaluate(async () => {
      const startY = 120;
      const endY = 220;
      const target = document.body;
      const touchInit = { bubbles: true, cancelable: true };
      target.dispatchEvent(
        new TouchEvent('touchstart', {
          ...touchInit,
          touches: [new Touch({ identifier: 1, target, clientX: 200, clientY: startY })],
        }),
      );
      target.dispatchEvent(
        new TouchEvent('touchmove', {
          ...touchInit,
          touches: [new Touch({ identifier: 1, target, clientX: 200, clientY: endY })],
        }),
      );
      target.dispatchEvent(
        new TouchEvent('touchend', {
          ...touchInit,
          changedTouches: [new Touch({ identifier: 1, target, clientX: 200, clientY: endY })],
        }),
      );
    });
  }

  findTabButton() {
    return this.page.getByRole('button', { name: TAB_LABELS.find });
  }

  tabBadge(tab: 'my' | 'chats' | 'marketplace') {
    const label = TAB_LABELS[tab];
    return this.page.getByRole('button', { name: label }).locator('span').filter({ hasText: /\d+/ });
  }
}

async function expectUrlPath(page: Page, path: string) {
  await page.waitForURL((url) => url.pathname === path || url.pathname === `${path}/`, { timeout: 15_000 });
}
