import { isCapacitor } from './capacitor';

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export async function openExternalUrl(url: string): Promise<void> {
  const href = url.trim();
  if (!href) return;

  if (isCapacitor()) {
    if (isHttpUrl(href)) {
      try {
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url: href });
      } catch {
        window.open(href, '_blank', 'noopener,noreferrer');
      }
      return;
    }
    window.location.href = href;
    return;
  }

  if (isHttpUrl(href)) {
    window.open(href, '_blank', 'noopener,noreferrer');
    return;
  }
  window.open(href, '_blank', 'noopener,noreferrer');
}
