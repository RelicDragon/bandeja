import puppeteer from 'puppeteer';
import { generateResultsHTML } from './results-html.service';
import { config } from '../../config/env';

interface Game {
  id: string;
  affectsRating: boolean;
  outcomes: any[];
  hasFixedTeams?: boolean;
  genderTeams?: string;
}

export async function generateResultsImage(game: Game, language: string = 'en-US'): Promise<Buffer> {
  let browser;
  
  try {
    const launchOptions: any = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-client-side-phishing-detection',
        '--disable-default-apps',
        '--disable-features=TranslateUI',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-renderer-backgrounding',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',
        '--enable-automation',
        '--password-store=basic',
        '--use-mock-keychain',
      ],
    };

    if (config.puppeteer.executablePath) {
      launchOptions.executablePath = config.puppeteer.executablePath;
    }

    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    const html = generateResultsHTML(game, language);
    
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const images = document.querySelectorAll<HTMLImageElement>('img');
        if (images.length === 0) {
          resolve();
          return;
        }
        
        let loadedCount = 0;
        const totalImages = images.length;
        
        const checkComplete = () => {
          loadedCount++;
          if (loadedCount === totalImages) {
            resolve();
          }
        };
        
        images.forEach((img) => {
          if (img.complete) {
            checkComplete();
          } else {
            img.onload = checkComplete;
            img.onerror = checkComplete;
          }
        });
      });
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    const screenshot = await page.screenshot({
      type: 'jpeg',
      quality: 95,
      fullPage: true,
    });

    return Buffer.from(screenshot as Buffer);
  } catch (error: any) {
    if (error.message?.includes('libnspr4.so') || error.message?.includes('shared libraries')) {
      throw new Error(
        'Puppeteer failed to launch Chrome due to missing system dependencies. ' +
        'Please install required libraries: libnspr4, libnss3, libatk1.0-0, libatk-bridge2.0-0, ' +
        'libcups2, libdrm2, libdbus-1-3, libxkbcommon0, libxcomposite1, libxdamage1, libxfixes3, ' +
        'libxrandr2, libgbm1, libasound2. ' +
        'Or set PUPPETEER_EXECUTABLE_PATH to use a system-installed Chrome/Chromium.'
      );
    }
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
