import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { assertBackendDatabaseSafe, guardE2eEnv } from './e2e/env-guard';
import { E2E_TEST_HEADER } from './e2e/test-user';

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(frontendRoot, '..', 'Backend');
const authFile = path.join(frontendRoot, 'e2e', '.auth', 'user.json');

const { baseURL: e2eBaseURL, apiURL: e2eApiURL } = guardE2eEnv();
await assertBackendDatabaseSafe(e2eApiURL);

export default defineConfig({
  testDir: path.join(frontendRoot, 'e2e', 'specs'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  globalSetup: path.join(frontendRoot, 'e2e', 'global-setup.ts'),
  use: {
    baseURL: e2eBaseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    extraHTTPHeaders: {
      [E2E_TEST_HEADER]: '1',
    },
  },
  projects: [
    {
      name: 'guest',
      testMatch: [/smoke\/guest\.spec\.ts$/, /shell\/.*\.spec\.ts$/, /cross-cutting\/.*\.spec\.ts$/],
      grepInvert: /@auth|@desktop/,
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'login',
      testMatch: [
        /smoke\/login\.spec\.ts$/,
        /auth\/.*\.spec\.ts$/,
        /onboarding\/.*\.spec\.ts$/,
      ],
      grepInvert: /@auth|@desktop/,
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'authenticated',
      testMatch: [
        /smoke\/navigation\.spec\.ts$/,
        /shell\/.*\.spec\.ts$/,
        /auth\/.*\.spec\.ts$/,
        /home\/.*\.spec\.ts$/,
        /find\/.*\.spec\.ts$/,
        /chats\/.*\.spec\.ts$/,
        /marketplace\/.*\.spec\.ts$/,
        /profile\/.*\.spec\.ts$/,
        /leaderboard\/.*\.spec\.ts$/,
        /cross-cutting\/.*\.spec\.ts$/,
        /games\/.*\.spec\.ts$/,
      ],
      grep: /@auth/,
      grepInvert: /@desktop/,
      use: {
        ...devices['Pixel 5'],
        storageState: authFile,
      },
    },
    {
      name: 'desktop',
      testMatch: [/shell\/.*\.spec\.ts$/],
      grep: /@desktop/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        storageState: authFile,
      },
    },
    {
      name: 'games-guest',
      testMatch: [/games\/game-details\.spec\.ts$/],
      grepInvert: /@auth/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'two-user',
      testMatch: [/two-user\/.*\.spec\.ts$/],
      grep: /@two-user/,
      fullyParallel: false,
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      cwd: backendRoot,
      url: 'http://localhost:3000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: 'npm run dev',
      cwd: frontendRoot,
      url: 'http://localhost:3001',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
