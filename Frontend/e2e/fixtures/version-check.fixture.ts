import type { Page } from '@playwright/test';

export type E2eVersionCheckStatus = 'ok' | 'optional_update' | 'blocking_update';

export type E2eVersionCheckResult = {
  status: E2eVersionCheckStatus;
  minVersion?: string;
  message?: string;
};

export async function injectVersionCheckResult(page: Page, result: E2eVersionCheckResult): Promise<void> {
  await page.addInitScript((payload) => {
    (window as Window & { __E2E_VERSION_CHECK__?: typeof payload }).__E2E_VERSION_CHECK__ = payload;
  }, result);
}
