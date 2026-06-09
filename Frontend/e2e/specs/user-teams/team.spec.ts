import { test, expect } from '@playwright/test';
import { e2eLogin } from '../../fixtures/api-client';
import { createUserTeamViaApi, deleteUserTeamViaApi } from '../../fixtures/user-teams.fixture';
import { UserTeamPage } from '../../pages/user-team.page';

test.describe('user teams @auth', () => {
  test('UT-01 Team page loads', async ({ page }) => {
    const { token } = await e2eLogin();
    const { id: teamId } = await createUserTeamViaApi(token);

    try {
      const teamPage = new UserTeamPage(page);
      await teamPage.goto(teamId);
      await teamPage.waitForLoaded();
      await expect(page).toHaveURL(new RegExp(`/user-team/${teamId}`));
      await expect(teamPage.pageRoot()).toBeVisible({ timeout: 20_000 });
      await expect(teamPage.teamNameInput()).toBeVisible({ timeout: 15_000 });
    } finally {
      await deleteUserTeamViaApi(token, teamId);
    }
  });
});

test.describe('user teams mobile @auth', () => {
  test('UT-06 Full-height mobile layout', async ({ page }) => {
    const { token } = await e2eLogin();
    const { id: teamId } = await createUserTeamViaApi(token);

    try {
      const teamPage = new UserTeamPage(page);
      await teamPage.goto(teamId);
      await teamPage.waitForLoaded();
      const box = await teamPage.pageRoot().boundingBox();
      expect(box?.height).toBeGreaterThan(200);
    } finally {
      await deleteUserTeamViaApi(token, teamId);
    }
  });
});
