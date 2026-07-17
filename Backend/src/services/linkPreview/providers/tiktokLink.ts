export function isTikTokLink(url: URL): boolean {
  const host = url.hostname.replace(/^www\./i, '');
  return (
    host === 'tiktok.com' ||
    host === 'vm.tiktok.com' ||
    host === 'vt.tiktok.com' ||
    /(^|\.)tiktok\.com$/i.test(host)
  );
}
