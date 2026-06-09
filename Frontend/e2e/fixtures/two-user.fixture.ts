import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { e2eLoginBoth, getE2eUserIds, type E2eDualSession, type E2eUserIds } from './api-client';

const frontendRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const authDir = path.join(frontendRoot, '.auth');
const authFileA = path.join(authDir, 'user-a.json');
const authFileB = path.join(authDir, 'user-b.json');

const teardownFns: Array<() => Promise<void>> = [];

export function registerTeardown(fn: () => Promise<void>): void {
  teardownFns.push(fn);
}

export async function runTeardown(): Promise<void> {
  const fns = [...teardownFns].reverse();
  teardownFns.length = 0;
  for (const fn of fns) {
    await fn().catch(() => undefined);
  }
}

export type DualSession = {
  pageA: Page;
  pageB: Page;
  contextA: BrowserContext;
  contextB: BrowserContext;
  ids: E2eUserIds;
  sessions: E2eDualSession;
  cleanup: () => Promise<void>;
};

function assertAuthFile(file: string, label: string): void {
  if (!fs.existsSync(file)) {
    throw new Error(`[e2e] Missing ${label} at ${file}. Run global-setup (npm run test:e2e).`);
  }
}

export async function openDualSession(browser: Browser): Promise<DualSession> {
  assertAuthFile(authFileA, 'user-a storageState');
  assertAuthFile(authFileB, 'user-b storageState');

  const [ids, sessions] = await Promise.all([getE2eUserIds(), e2eLoginBoth()]);
  const contextA = await browser.newContext({ storageState: authFileA });
  const contextB = await browser.newContext({ storageState: authFileB });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const cleanup = async () => {
    await runTeardown();
    await contextA.close().catch(() => undefined);
    await contextB.close().catch(() => undefined);
  };

  return { pageA, pageB, contextA, contextB, ids, sessions, cleanup };
}
