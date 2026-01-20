import puppeteer from 'puppeteer';
import { generateResultsHTML } from './results-html.service';

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
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
      ],
    });

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
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
