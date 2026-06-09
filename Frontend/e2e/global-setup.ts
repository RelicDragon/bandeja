import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type FullConfig } from '@playwright/test';
import { e2eApiHeaders, getE2eCredentials } from './test-user';

const frontendRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const authDir = path.join(frontendRoot, 'e2e', '.auth');
const authFile = path.join(authDir, 'user.json');

type LoginPayload = {
  data?: {
    token?: string;
    user?: unknown;
  };
};

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const { phone, password } = getE2eCredentials();

  const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3001';
  const apiURL = process.env.E2E_API_URL ?? 'http://localhost:3000/api';

  const loginRes = await fetch(`${apiURL}/auth/login/phone`, {
    method: 'POST',
    headers: e2eApiHeaders(),
    body: JSON.stringify({ phone, password, language: 'en' }),
  });

  if (!loginRes.ok) {
    const body = await loginRes.text();
    throw new Error(`[e2e] API login failed (${loginRes.status}): ${body}`);
  }

  const payload = (await loginRes.json()) as LoginPayload;
  const token = payload.data?.token;
  const user = payload.data?.user;
  if (!token || !user) {
    throw new Error('[e2e] API login response missing token or user');
  }

  fs.mkdirSync(authDir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseURL}/login`);
  await page.evaluate(
    ({ authToken, authUser }) => {
      localStorage.setItem('token', authToken);
      localStorage.setItem('user', JSON.stringify(authUser));
    },
    { authToken: token, authUser: user },
  );
  await context.storageState({ path: authFile });
  await browser.close();

  console.log(`[e2e] Auth storageState written to ${authFile}`);
}
