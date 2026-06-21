import { expect, type Locator, type Page } from '@playwright/test';

const GAME_FILTERS_KEY = 'padelpulse-game-filters';

type EntityFilter = 'game' | 'training' | 'tournament' | 'leagues';

type GameFilterSeed = {
  activeTab?: 'calendar' | 'list';
  filterAvailableSlots?: boolean;
  filterSuitableRating?: boolean;
  hideBarGames?: boolean;
  /** @deprecated */
  userFilter?: boolean;
  gameFilter?: boolean;
  trainingFilter?: boolean;
  tournamentFilter?: boolean;
  leaguesFilter?: boolean;
  filtersPanelOpen?: boolean;
  filterClubIds?: string[];
  filterTimeStart?: string;
  filterTimeEnd?: string;
  filterLevelMin?: number;
  filterLevelMax?: number;
  filterSport?: string;
  filterNoRating?: boolean;
  showPrivateGames?: boolean;
};

async function writeGameFilters(page: Page, patch: GameFilterSeed) {
  await page.evaluate(
    async ({ storageKey, values }) => {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('keyval-store');
        open.onerror = () => reject(open.error);
        open.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('keyval')) {
            db.createObjectStore('keyval');
          }
        };
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('keyval', 'readwrite');
          const store = tx.objectStore('keyval');
          const getReq = store.get(storageKey);
          getReq.onsuccess = () => {
            const current = (getReq.result as Record<string, unknown> | undefined) ?? {};
            store.put({ ...current, ...values }, storageKey);
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      });
    },
    { storageKey: GAME_FILTERS_KEY, values: patch },
  );
}

async function readGameFilters(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(async (storageKey) => {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const open = indexedDB.open('keyval-store');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('keyval', 'readonly');
        const store = tx.objectStore('keyval');
        const getReq = store.get(storageKey);
        getReq.onsuccess = () => resolve((getReq.result as Record<string, unknown>) ?? {});
        getReq.onerror = () => reject(getReq.error);
      };
    });
  }, GAME_FILTERS_KEY);
}

const ENTITY_LABEL: Record<EntityFilter, RegExp> = {
  game: /^games$/i,
  training: /^training$/i,
  tournament: /^tournament$/i,
  leagues: /^leagues$/i,
};

export class FindPage {
  constructor(private readonly page: Page) {}

  async goto(query = '') {
    await this.page.goto(query ? `/find?${query}` : '/find');
    await this.page.waitForURL(/\/find/, { timeout: 20_000 });
    await this.waitForShell();
  }

  async gotoListView() {
    await this.goto('view=list');
  }

  async gotoCalendarView() {
    await this.goto('view=calendar');
  }

  async waitForShell() {
    await this.page
      .getByRole('button', { name: /^my$|^find$|^chats$|^market$|^top$/i })
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 });
  }

  async waitForAvailableGamesLoaded() {
    await this.page
      .waitForResponse((res) => res.url().includes('/games/available') && res.ok(), { timeout: 30_000 })
      .catch(async () => {
        await this.page.waitForLoadState('domcontentloaded');
      });
  }

  calendar(): Locator {
    return this.page.locator('[data-calendar="true"]');
  }

  listWeekRangeLabel(): Locator {
    return this.page.locator('.text-sm.font-medium.text-gray-700').filter({ hasText: /\d{2}\.\d{2}\.\d{4}/ });
  }

  gameCards(): Locator {
    return this.page.locator('.cursor-pointer.relative.pb-0.overflow-visible');
  }

  joinButtons(): Locator {
    return this.page.getByRole('button', { name: /^join the game$/i });
  }

  emptyStateMessage(): Locator {
    return this.page.getByText(
      /no games found|no training found|no tournament found|no leagues found/i,
    );
  }

  entityFilter(name: EntityFilter): Locator {
    return this.page.getByRole('button', { name: ENTITY_LABEL[name] });
  }

  filtersButton(): Locator {
    return this.page.getByRole('button', { name: /^filters$/i });
  }

  filtersPanel(): Locator {
    return this.page.getByText(/^have available slots$/i);
  }

  resetFiltersButton(): Locator {
    return this.page.getByRole('button', { name: /^reset filters$/i });
  }

  listDatePrev(): Locator {
    return this.listWeekRangeLabel().locator('..').getByRole('button').first();
  }

  listDateNext(): Locator {
    return this.listWeekRangeLabel().locator('..').getByRole('button').last();
  }

  monthPrevButton(): Locator {
    return this.calendar().getByRole('button').first();
  }

  monthNextButton(): Locator {
    return this.calendar().getByRole('button').last();
  }

  monthHeading(): Locator {
    return this.calendar().locator('h3');
  }

  cityButton(): Locator {
    return this.page.locator('header').getByRole('button').filter({ has: this.page.locator('svg') }).first();
  }

  trainersSection(): Locator {
    return this.page.getByText(/trainers/i).first();
  }

  async seedGameFilters(patch: GameFilterSeed) {
    if (!this.page.url().includes('/find')) {
      await this.page.goto('/find');
      await this.waitForShell();
    }
    await writeGameFilters(this.page, patch);
  }

  async readStoredFilters(): Promise<Record<string, unknown>> {
    return readGameFilters(this.page);
  }

  async openFiltersPanel() {
    await this.filtersButton().click();
    await expect(this.filtersPanel()).toBeVisible({ timeout: 10_000 });
  }

  async closeFiltersPanel() {
    await this.filtersButton().click();
    await expect(this.filtersPanel()).toHaveCount(0, { timeout: 10_000 });
  }

  async toggleEntityFilter(name: EntityFilter) {
    const chip = this.entityFilter(name);
    await chip.click();
    return chip;
  }

  async expectEntityFilterActive(name: EntityFilter, active: boolean) {
    const chip = this.entityFilter(name);
    if (active) {
      await expect(chip).toHaveClass(/primary/);
    } else {
      await expect(chip).not.toHaveClass(/primary-100/);
    }
  }

  async setAvailabilityFilters(options: { availableSlots?: boolean; suitableRating?: boolean }) {
    const panel = this.filtersPanel().locator('..');
    const switches = panel.getByRole('switch');
    if (options.availableSlots !== undefined) {
      const toggle = switches.nth(0);
      const checked = await toggle.getAttribute('aria-checked');
      if ((checked === 'true') !== options.availableSlots) {
        await toggle.click();
      }
    }
    if (options.suitableRating !== undefined) {
      const toggle = switches.nth(1);
      const checked = await toggle.getAttribute('aria-checked');
      if ((checked === 'true') !== options.suitableRating) {
        await toggle.click();
      }
    }
  }

  async setUserFilter(enabled: boolean) {
    await this.setAvailabilityFilters({ availableSlots: enabled, suitableRating: enabled });
  }

  async selectClubChip(clubName: string) {
    await this.page.getByRole('button', { name: new RegExp(clubName, 'i') }).click();
  }

  async resetPanelFilters() {
    const reset = this.resetFiltersButton();
    if ((await reset.count()) > 0) {
      await reset.first().click();
    }
  }

  async goToTodayViaFindTab() {
    await this.page.getByRole('button', { name: /^find$/i }).click();
  }

  async openGameCardMatching(text: RegExp | string): Promise<string | null> {
    await this.waitForAvailableGamesLoaded();
    let card = this.gameCards().filter({ hasText: text }).first();
    if ((await card.count()) === 0) {
      await this.seedGameFilters({ activeTab: 'list' });
      await this.goto('view=list');
      await this.waitForAvailableGamesLoaded();
      card = this.gameCards().filter({ hasText: text }).first();
    }
    if ((await card.count()) === 0) return null;
    await card.click();
    await this.page.waitForURL(/\/games\/[^/]+$/, { timeout: 15_000 });
    const match = this.page.url().match(/\/games\/([^/?#]+)/);
    return match?.[1] ?? null;
  }

  async quickJoinOnCard(label: RegExp | string) {
    const joinOnCard = this.gameCards()
      .filter({ hasText: label })
      .getByRole('button', { name: /^join the game$/i });
    await joinOnCard.click();
    await this.page.getByRole('dialog').filter({ hasText: /join game\?/i }).waitFor({ state: 'visible' });
    const joinResponse = this.page.waitForResponse(
      (res) => res.url().includes('/join') && res.request().method() === 'POST',
      { timeout: 30_000 },
    );
    await this.page.getByRole('button', { name: /^confirm$/i }).click();
    await joinResponse;
  }

  async seedImpossibleLevelFilters() {
    await this.seedGameFilters({
      filterAvailableSlots: false,
      filterSuitableRating: false,
      hideBarGames: false,
      gameFilter: false,
      trainingFilter: false,
      tournamentFilter: false,
      leaguesFilter: false,
      activeTab: 'calendar',
      filtersPanelOpen: false,
      filterClubIds: [],
      filterTimeStart: '00:00',
      filterTimeEnd: '24:00',
      filterLevelMin: 7.01,
      filterLevelMax: 7.5,
      filterSport: 'primary',
      filterNoRating: false,
      showPrivateGames: false,
    });
  }

  async expectFiltersButtonActive(active: boolean) {
    const btn = this.filtersButton();
    if (active) {
      await expect(btn).toHaveClass(/primary/);
    } else {
      await expect(btn).not.toHaveClass(/primary-100/);
    }
  }
}
