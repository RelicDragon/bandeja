import { expect, test } from '@playwright/test';
import { e2eApi, e2eLogin } from '../../fixtures/api-client';

type GameListItem = {
  id: string;
  weatherSummary?: { conditionKey: string } | null;
};

async function resolveGameWithWeather(): Promise<string | null> {
  const { token } = await e2eLogin('A');
  for (const path of ['/games/my-games', '/games/available']) {
    const games = await e2eApi<GameListItem[]>(token, path);
    const match = games.find((game) => game.weatherSummary);
    if (match) return match.id;
  }
  return null;
}

test.describe('weather dialog overlay stability @auth', () => {
  test('overlay opacity does not dip after the weather dialog opens', async ({ page }) => {
    const gameId = await resolveGameWithWeather();
    test.skip(!gameId, 'No games with weather in seeded data');

    await page.goto(`/games/${gameId}`);
    await page.waitForLoadState('domcontentloaded');

    const weatherButton = page.getByRole('button', { name: /open weather forecast/i }).first();
    await expect(weatherButton).toBeVisible({ timeout: 20_000 });

    await page.evaluate(() => {
      const samples: Array<{ t: number; opacity: number }> = [];
      const sample = () => {
        const overlay = document.querySelector('.dialog-overlay-animate[data-state="open"]');
        if (!overlay) return;
        samples.push({
          t: performance.now(),
          opacity: Number.parseFloat(getComputedStyle(overlay).opacity) || 0,
        });
      };

      const observer = new MutationObserver(sample);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-state', 'style', 'class'],
      });

      const interval = window.setInterval(sample, 16);
      (window as unknown as { __weatherDialogOverlayProbe: { samples: typeof samples; stop: () => void } }).__weatherDialogOverlayProbe = {
        samples,
        stop: () => {
          observer.disconnect();
          window.clearInterval(interval);
        },
      };
    });

    await weatherButton.click();
    await expect(page.getByTestId('weather-dialog')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(600);

    const result = await page.evaluate(() => {
      const probe = (window as unknown as {
        __weatherDialogOverlayProbe?: { samples: Array<{ t: number; opacity: number }>; stop: () => void };
      }).__weatherDialogOverlayProbe;
      probe?.stop();
      const overlay = document.querySelector('.dialog-overlay-animate[data-state="open"]');
      const finalOpacity = overlay
        ? Number.parseFloat(getComputedStyle(overlay).opacity) || 0
        : 0;
      return { samples: probe?.samples ?? [], finalOpacity };
    });

    expect(result.finalOpacity).toBeGreaterThan(0.9);

    const firstOpenIdx = result.samples.findIndex((sample) => sample.opacity >= 0.5);
    if (firstOpenIdx >= 0) {
      const postOpen = result.samples.slice(firstOpenIdx + 1);
      if (postOpen.length > 0) {
        const minOpacity = Math.min(...postOpen.map((sample) => sample.opacity));
        expect(minOpacity).toBeGreaterThan(0.85);
      }
    }
  });
});
