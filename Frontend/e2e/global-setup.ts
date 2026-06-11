import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type FullConfig } from '@playwright/test';
import { assertBackendDatabaseSafe, guardE2eEnv } from './env-guard';
import { e2eApiHeaders, getE2eCredentials, type E2eUserRole } from './test-user';

const frontendRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const authDir = path.join(frontendRoot, 'e2e', '.auth');
const authFileLegacy = path.join(authDir, 'user.json');
const authFileA = path.join(authDir, 'user-a.json');
const authFileB = path.join(authDir, 'user-b.json');
const idsFile = path.join(authDir, 'ids.json');

type LoginPayload = {
  data?: {
    token?: string;
    user?: { id?: string };
  };
};

async function loginUser(role: E2eUserRole): Promise<{ token: string; userId: string }> {
  const { phone, password } = getE2eCredentials(role);
  const { apiURL } = guardE2eEnv();

  const loginRes = await fetch(`${apiURL}/auth/login/phone`, {
    method: 'POST',
    headers: e2eApiHeaders(),
    body: JSON.stringify({ phone, password, language: 'en' }),
  });

  if (!loginRes.ok) {
    const body = await loginRes.text();
    const hint =
      role === 'B'
        ? ' Seed User B (+79672820000) in padelpulse_dev or set E2E_PHONE_B / E2E_PASSWORD_B.'
        : '';
    throw new Error(`[e2e] API login failed for user ${role} (${loginRes.status}): ${body}.${hint}`);
  }

  const payload = (await loginRes.json()) as LoginPayload;
  const token = payload.data?.token;
  const userId = payload.data?.user?.id;
  if (!token || !userId) {
    throw new Error(`[e2e] API login response for user ${role} missing token or user id`);
  }
  return { token, userId };
}

async function writeStorageState(
  baseURL: string,
  token: string,
  user: unknown,
  outPath: string,
): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseURL}/login`);
  await page.goto(`${baseURL}/login`);
  await page.evaluate(
    ({ authToken, authUser }) => {
      localStorage.setItem('token', authToken);
      localStorage.setItem('user', JSON.stringify(authUser));
    },
    { authToken: token, authUser: user },
  );
  await page.goto(`${baseURL}/`);
  await page.waitForLoadState('domcontentloaded');
  await context.storageState({ path: outPath });
  await browser.close();
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const { baseURL, apiURL } = guardE2eEnv();
  await assertBackendDatabaseSafe(apiURL);

  fs.mkdirSync(authDir, { recursive: true });

  const sessionA = await loginUser('A');
  const sessionB = await loginUser('B');

  const loginResA = await fetch(`${apiURL}/auth/login/phone`, {
    method: 'POST',
    headers: e2eApiHeaders(),
    body: JSON.stringify({ ...getE2eCredentials('A'), language: 'en' }),
  });
  const loginResB = await fetch(`${apiURL}/auth/login/phone`, {
    method: 'POST',
    headers: e2eApiHeaders(),
    body: JSON.stringify({ ...getE2eCredentials('B'), language: 'en' }),
  });
  const userA = ((await loginResA.json()) as LoginPayload).data?.user;
  const userB = ((await loginResB.json()) as LoginPayload).data?.user;

  await writeStorageState(baseURL, sessionA.token, userA, authFileA);
  await writeStorageState(baseURL, sessionB.token, userB, authFileB);
  fs.copyFileSync(authFileA, authFileLegacy);

  fs.writeFileSync(
    idsFile,
    JSON.stringify({ userAId: sessionA.userId, userBId: sessionB.userId }, null, 2),
  );

  console.log(`[e2e] Auth storageState: ${authFileA}, ${authFileB} (legacy: ${authFileLegacy})`);
  console.log(`[e2e] User ids: A=${sessionA.userId}, B=${sessionB.userId}`);
}
