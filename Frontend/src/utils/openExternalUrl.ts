import { isCapacitor } from './capacitor';

function ensureHttp(url: string): string {
  const s = url.trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

export async function openExternalUrl(url: string): Promise<void> {
  const href = ensureHttp(url);
  if (!href || !href.startsWith('http')) return;
  if (isCapacitor()) {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url: href });
    } catch {
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  } else {
    window.open(href, '_blank', 'noopener,noreferrer');
  }
}
