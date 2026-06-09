import { type Locator, type Page } from '@playwright/test';

const GAME_FILTERS_KEY = 'padelpulse-game-filters';

type GameFilterSeed = {
  activeTab?: 'calendar' | 'list';
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

export class FindPage {
  constructor(private readonly page: Page) {}

  async goto(query = '') {
    await this.page.goto(query ? `/find?${query}` : '/find');
    await this.page.waitForURL(/\/find/, { timeout: 20_000 });
    await this.waitForShell();
  }

  async waitForShell() {
    await this.page.getByRole('button', { name: /^chats$/i }).waitFor({ state: 'visible', timeout: 30_000 });
  }

  async waitForAvailableGamesLoaded() {
    await this.page.waitForResponse(
      (res) => res.url().includes('/games/available') && res.ok(),
      { timeout: 30_000 },
    ).catch(async () => {
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

  async seedGameFilters(patch: GameFilterSeed) {
    if (!this.page.url().includes('localhost')) {
      await this.page.goto('/find');
    } else if (!this.page.url().includes('/find')) {
      await this.page.goto('/find');
      await this.waitForShell();
    }
    await writeGameFilters(this.page, patch);
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

  async seedImpossibleLevelFilters() {
    await this.seedGameFilters({
      userFilter: false,
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
}
