import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(frontendRoot, '..', 'Backend');
const authFile = path.join(frontendRoot, 'e2e', '.auth', 'user.json');

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
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'guest',
      testMatch: /guest\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'login',
      testMatch: /login\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'authenticated',
      testMatch: /navigation\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: authFile,
      },
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
