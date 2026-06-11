import type { Locator, Page } from '@playwright/test';

export class MarketplacePage {
  constructor(private readonly page: Page) {}

  async gotoList(query = '') {
    await this.page.goto(query ? `/marketplace?${query}` : '/marketplace');
    await this.page.waitForURL(/\/marketplace\/?(\?|$)/, { timeout: 20_000 });
  }

  async gotoMyListings() {
    await this.page.goto('/marketplace/my');
    await this.page.waitForURL(/\/marketplace\/my\/?(\?|$)/, { timeout: 20_000 });
  }

  async gotoCreate() {
    await this.page.goto('/marketplace/create');
    await this.page.waitForURL(/\/marketplace\/create\/?(\?|$)/, { timeout: 20_000 });
  }

  async gotoEdit(itemId: string) {
    await this.page.goto(`/marketplace/${itemId}/edit`);
    await this.page.waitForURL(new RegExp(`/marketplace/${itemId}/edit`), { timeout: 20_000 });
  }

  async gotoItemDeepLink(itemId: string) {
    await this.page.goto(`/marketplace/${itemId}`);
    await this.page.waitForURL(/\/marketplace/, { timeout: 20_000 });
  }

  async waitForListLoaded() {
    await this.page
      .waitForResponse((res) => res.url().includes('/marketplace') && res.ok(), { timeout: 30_000 })
      .catch(() => undefined);
    await this.page.locator('.animate-spin').first().waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => undefined);
  }

  itemCards(): Locator {
    return this.page.locator('article[role="button"]');
  }

  firstItemCard(): Locator {
    return this.itemCards().first();
  }

  itemCardMatching(text: string | RegExp): Locator {
    return this.itemCards().filter({ hasText: text });
  }

  emptyState(): Locator {
    return this.page.getByText(/no listings found/i);
  }

  myListingsLabel(): Locator {
    return this.page.getByText(/my listings/i);
  }

  categoryButtons(): Locator {
    return this.page.locator('button[type="button"]').filter({ hasText: /.+/ });
  }

  drawerCloseButton(): Locator {
    return this.page.getByRole('button', { name: /^close$/i });
  }

  notFoundState(): Locator {
    return this.page.getByText(/listing not found/i);
  }

  titleInput(): Locator {
    return this.page.getByPlaceholder(/listing title/i);
  }

  descriptionInput(): Locator {
    return this.page.getByPlaceholder(/describe your listing/i);
  }

  priceInput(): Locator {
    return this.page.locator('input[inputmode="decimal"], input[placeholder="0.00"]').first();
  }

  createSubmitButton(): Locator {
    return this.page.getByRole('button', { name: /^create$/i });
  }

  saveSubmitButton(): Locator {
    return this.page.getByRole('button', { name: /^save$/i });
  }

  placeBidButton(): Locator {
    return this.page.getByRole('button', { name: /place a bid|place bid/i });
  }

  viewBidsButton(): Locator {
    return this.page.getByRole('button', { name: /view bids/i });
  }

  bidAmountInput(): Locator {
    return this.page.locator('input[inputmode="decimal"]').last();
  }

  bidSubmitButton(): Locator {
    return this.page.getByRole('button', { name: /^place bid$/i });
  }

  async openFirstItemDrawer() {
    await this.firstItemCard().click();
    await this.drawerCloseButton().waitFor({ state: 'visible', timeout: 15_000 });
  }

  async openItemDrawerByTitle(title: string | RegExp) {
    await this.itemCardMatching(title).first().click();
    await this.drawerCloseButton().waitFor({ state: 'visible', timeout: 15_000 });
  }

  async closeDrawer() {
    await this.drawerCloseButton().click();
    await this.drawerCloseButton().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
  }

  async selectTradeType(label: RegExp) {
    await this.page.getByRole('button', { name: label }).click();
  }

  async selectFirstCategoryIfNeeded() {
    const selected = this.page.locator('button.border-primary-500, button.bg-primary-500').first();
    if (await selected.isVisible().catch(() => false)) return;
    const category = this.page.locator('form button[type="button"]').filter({ hasText: /.+/ }).first();
    if ((await category.count()) > 0) await category.click();
  }

  async selectAuctionDurationDays(days: number) {
    await this.page.getByRole('button', { name: new RegExp(`${days}\\s*day`, 'i') }).click();
  }

  async fillTitle(title: string) {
    await this.titleInput().fill(title);
  }

  async fillDescription(description: string) {
    await this.descriptionInput().fill(description);
  }

  async fillPrice(amount: string) {
    await this.priceInput().fill(amount);
  }

  async submitCreate() {
    const response = this.page.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url().includes('/market-items') && res.ok(),
      { timeout: 30_000 },
    );
    await this.createSubmitButton().click();
    await response.catch(() => undefined);
  }

  async scrollListToEnd() {
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await this.page.waitForTimeout(800);
  }

  async seedCreateDraft(title: string) {
    await this.page.evaluate((draftTitle) => {
      localStorage.setItem(
        'marketplace_create_draft',
        JSON.stringify({
          categoryId: '',
          cityId: '',
          additionalCityIds: [],
          title: draftTitle,
          description: 'draft body',
          mediaUrls: [],
          tradeTypes: ['BUY_IT_NOW'],
          priceCents: '10',
          currency: 'EUR',
        }),
      );
    }, title);
  }

  draftTitleValue(): Promise<string | null> {
    return this.titleInput().inputValue();
  }

  async placeBidInModal(amount: string) {
    await this.placeBidButton().click();
    await this.page.getByRole('heading', { name: /place a bid/i }).waitFor({ state: 'visible', timeout: 10_000 });
    await this.bidAmountInput().fill(amount);
    const response = this.page.waitForResponse(
      (res) => res.request().method() === 'POST' && /\/bids/.test(res.url()),
      { timeout: 30_000 },
    );
    await this.bidSubmitButton().click();
    await response.catch(() => undefined);
  }

  async gotoItem(itemId: string) {
    await this.gotoItemDeepLink(itemId);
  }

  itemTitleHeading(title: string) {
    return this.page.getByRole('heading', { name: title });
  }

  async waitForItemLoaded(title?: string) {
    if (title) {
      await this.itemTitleHeading(title).waitFor({ state: 'visible', timeout: 20_000 });
    }
    await this.page
      .waitForResponse((res) => res.url().includes('/market-items') && res.ok(), { timeout: 30_000 })
      .catch(() => undefined);
    await this.page.locator('.animate-spin').first().waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => undefined);
  }

  currentBidLabel(): Locator {
    return this.page.getByText(/current bid:/i);
  }

  startingPriceLabel(): Locator {
    return this.page.getByText(/starting price:/i);
  }

  currentPriceLabel(): Locator {
    return this.page.getByText(/current price:/i);
  }

  soldOrBidIndicator(): Locator {
    return this.page.getByText(/1 bid|sold|winner/i).first();
  }

  priceText(cents: number): Locator {
    const major = (cents / 100).toFixed(2);
    return this.page.getByText(new RegExp(`€\\s*${major.replace('.', '[,.]')}|${major.replace('.', '[,.]')}`, 'i'));
  }
}
