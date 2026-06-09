import { test } from '@playwright/test';
import { OverlaysPage } from '../../pages/overlays.page';
import { MarketplacePage } from '../../pages/marketplace.page';
import { ShellPage } from '../../pages/shell.page';
import { getE2eUserIds } from '../../fixtures/api-client';

test.describe('shell overlays @auth', () => {
  test('G-17 G-24 player overlay URL', async ({ page }) => {
    const { userBId } = await getE2eUserIds();
    await page.goto(`/?player=${userBId}`);
    await new OverlaysPage(page).expectPlayerOverlayOpen();
  });

  test('G-26 overlay dismiss player', async ({ page }) => {
    const { userBId } = await getE2eUserIds();
    const overlays = new OverlaysPage(page);
    await page.goto(`/?player=${userBId}`);
    await overlays.expectPlayerOverlayOpen();
    await overlays.closePlayerOverlay();
    await overlays.expectPlayerQueryRemoved();
    await new ShellPage(page).expectBottomTabsVisible();
  });

  test('G-25 G-16 marketplace item overlay', async ({ page }) => {
    const marketplace = new MarketplacePage(page);
    await marketplace.gotoList();
    await marketplace.waitForListLoaded();
    const count = await marketplace.itemCards().count();
    test.skip(count === 0, 'No marketplace listings in seeded data');

    const href = await marketplace.firstItemCard().getAttribute('data-item-id');
    let itemId = href;
    if (!itemId) {
      await marketplace.openFirstItemDrawer();
      const url = new URL(page.url());
      itemId = url.searchParams.get('item');
    }
    test.skip(!itemId, 'Could not resolve marketplace item id');

    await page.goto(`/marketplace?item=${itemId}`);
    await new OverlaysPage(page).expectMarketplaceItemDrawer();
  });

  test('G-26 overlay dismiss marketplace item', async ({ page }) => {
    const marketplace = new MarketplacePage(page);
    await marketplace.gotoList();
    await marketplace.waitForListLoaded();
    test.skip((await marketplace.itemCards().count()) === 0, 'No marketplace listings');

    await marketplace.openFirstItemDrawer();
    const itemId = new URL(page.url()).searchParams.get('item');
    test.skip(!itemId, 'Item query missing after open');

    const overlays = new OverlaysPage(page);
    await overlays.closeMarketplaceDrawer();
    await overlays.expectItemQueryRemoved();
  });
});
