import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request } from 'express';

export const E2E_TEST_HEADER = 'x-e2e-test';

const e2eContext = new AsyncLocalStorage<{ suppressNotifications: boolean }>();

export function isE2eTestHeader(req: Pick<Request, 'get'>): boolean {
  const value = req.get(E2E_TEST_HEADER);
  return value === '1' || value === 'true';
}

export function isE2eTestContext(): boolean {
  return e2eContext.getStore()?.suppressNotifications === true;
}

export function shouldSuppressOutboundNotifications(): boolean {
  return isE2eTestContext() || process.env.E2E_TEST === '1';
}

export function runWithE2eTestContext<T>(fn: () => T): T {
  return e2eContext.run({ suppressNotifications: true }, fn);
}
