import { test, expect } from '@playwright/test';
import {
  createRisingAuctionListing,
  placeBidViaApi,
  withdrawMarketListingViaApi,
} from '../../fixtures/marketplace.fixture';
import { registerTeardown, openDualSession } from '../../fixtures/two-user.fixture';

test.describe('two-user marketplace @two-user @auth', () => {
  test.describe.configure({ mode: 'serial' });

  test('T2-M-02 bid updates seller view @hybrid', async ({ browser }) => {
    const { pageB, ids, sessions, cleanup } = await openDualSession(browser);
    let itemId = '';
    try {
      const title = `[E2E] T2-M-02 ${Date.now()}`;
      const listing = await createRisingAuctionListing(sessions.tokenB, ids.userBId, {
        title,
        startingPriceCents: 1_000,
      });
      itemId = listing.id;
      registerTeardown(() => withdrawMarketListingViaApi(sessions.tokenB, itemId));

      await pageB.goto(`/marketplace/${itemId}`);
      await pageB.getByText(title).waitFor({ state: 'visible', timeout: 20_000 });

      await placeBidViaApi(sessions.tokenA, itemId, 1_500);

      await expect
        .poll(async () => pageB.getByText(/15[,.]00|1\s*500|€\s*15/i).first().isVisible(), { timeout: 20_000 })
        .toBe(true);
    } finally {
      await cleanup();
    }
  });
});
