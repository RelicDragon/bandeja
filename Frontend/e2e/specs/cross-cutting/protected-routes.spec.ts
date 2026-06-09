import { test, expect } from '@playwright/test';

const protectedPaths = ['/chats', '/marketplace', '/profile', '/leaderboard'];

test.describe('cross-cutting permissions @guest', () => {
  test('X-01 Protected routes without auth redirect to login', async ({ page }) => {
    for (const path of protectedPaths) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    }
  });
});
