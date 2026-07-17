export function isXLink(url: URL): boolean {
  const host = url.hostname.replace(/^www\./i, '').toLowerCase();
  return (host === 'x.com' || host === 'twitter.com') && /^\/[^/]+\/status\/\d+/.test(url.pathname);
}
