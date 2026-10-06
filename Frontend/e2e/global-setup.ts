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
    user?: { id?: string } & Record<string, unknown>;
  };
};

async function loginUser(
  role: E2eUserRole,
): Promise<{ token: string; userId: string; user: Record<string, unknown> }> {
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
  const user = payload.data?.user;
  const userId = user?.id;
  if (!token || !user || !userId) {
    throw new Error(`[e2e] API login response for user ${role} missing token or user id`);
  }
  return { token, userId, user };
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

type StorageStateFile = {
  cookies: unknown[];
  origins: { origin: string; localStorage: { name: string; value: string }[] }[];
};

/**
 * The storage state only carries an access JWT (API login sets the httpOnly refresh cookie on
 * Node's fetch, not the browser), so once it nears expiry (`JWT_ACCESS_EXPIRES_IN`, 30m in dev,
 * minus the 2m client leeway) the app's startup refresh fails and clears auth: later specs of a
 * long run land on /login. Playwright reads a `storageState` path at each context creation, so
 * swapping a fresh token into the files keeps every new test signed in.
 */
function rewriteStorageStateToken(filePath: string, origin: string, token: string, user: unknown): void {
  const state = JSON.parse(fs.readFileSync(filePath, 'utf8')) as StorageStateFile;
  const entry = state.origins.find((o) => o.origin === origin);
  if (!entry) throw new Error(`[e2e] ${filePath} has no localStorage for ${origin}`);
  const dropped = new Set(['token', 'user', 'auth_backup', 'auth_last_check', 'auth_explicit_logout_at']);
  entry.localStorage = [
    ...entry.localStorage.filter((item) => !dropped.has(item.name)),
    { name: 'token', value: token },
    { name: 'user', value: JSON.stringify(user) },
  ];
  // Atomic: a worker creating a context mid-write must never read a partial file.
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, filePath);
}

function accessTokenLifetimeMs(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as {
      iat?: number;
      exp?: number;
    };
    if (!payload.iat || !payload.exp) return null;
    return (payload.exp - payload.iat) * 1000;
  } catch {
    return null;
  }
}

function startStorageStateRefresher(baseURL: string, accessToken: string): () => void {
  const origin = new URL(baseURL).origin;
  const lifetimeMs = accessTokenLifetimeMs(accessToken) ?? 30 * 60_000;
  const intervalMs = Math.max(60_000, Math.min(10 * 60_000, Math.floor(lifetimeMs / 3)));
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void (async () => {
      try {
        const [a, b] = await Promise.all([loginUser('A'), loginUser('B')]);
        rewriteStorageStateToken(authFileA, origin, a.token, a.user);
        rewriteStorageStateToken(authFileB, origin, b.token, b.user);
        rewriteStorageStateToken(authFileLegacy, origin, a.token, a.user);
      } catch (error) {
        console.warn('[e2e] storageState token refresh failed', error);
      } finally {
        running = false;
      }
    })();
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

export default async function globalSetup(_config: FullConfig): Promise<() => void> {
  const { baseURL, apiURL } = guardE2eEnv();
  await assertBackendDatabaseSafe(apiURL);

  fs.mkdirSync(authDir, { recursive: true });

  const sessionA = await loginUser('A');
  const sessionB = await loginUser('B');

  await writeStorageState(baseURL, sessionA.token, sessionA.user, authFileA);
  await writeStorageState(baseURL, sessionB.token, sessionB.user, authFileB);
  fs.copyFileSync(authFileA, authFileLegacy);

  fs.writeFileSync(
    idsFile,
    JSON.stringify({ userAId: sessionA.userId, userBId: sessionB.userId }, null, 2),
  );

  console.log(`[e2e] Auth storageState: ${authFileA}, ${authFileB} (legacy: ${authFileLegacy})`);
  console.log(`[e2e] User ids: A=${sessionA.userId}, B=${sessionB.userId}`);

  // Returned function runs as global teardown.
  return startStorageStateRefresher(baseURL, sessionA.token);
}
