import { expect, test } from '@playwright/test';
import { getE2eUserIds } from '../../fixtures/api-client';
import { OverlaysPage } from '../../pages/overlays.page';

test.describe('player card overlay stability @auth', () => {
  test('overlay opacity does not dip after the sheet opens', async ({ page }) => {
    const { userBId } = await getE2eUserIds();

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.evaluate(() => {
      const samples: Array<{ t: number; opacity: number }> = [];
      const sample = () => {
        const overlay = document.querySelector('[data-vaul-overlay]');
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
      (window as unknown as { __playerCardOverlayProbe: { samples: typeof samples; stop: () => void } }).__playerCardOverlayProbe = {
        samples,
        stop: () => {
          observer.disconnect();
          window.clearInterval(interval);
        },
      };
    });

    await page.goto(`/?player=${userBId}`);
    await new OverlaysPage(page).expectPlayerOverlayOpen();
    await page.waitForTimeout(600);

    const result = await page.evaluate(() => {
      const probe = (window as unknown as {
        __playerCardOverlayProbe?: { samples: Array<{ t: number; opacity: number }>; stop: () => void };
      }).__playerCardOverlayProbe;
      probe?.stop();
      const overlay = document.querySelector('[data-vaul-overlay]');
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
