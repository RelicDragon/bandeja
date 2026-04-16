export function websiteDisplayHost(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.hostname.replace(/^www\./, '') || s;
  } catch {
    return s.replace(/^https?:\/\//i, '').split('/')[0] ?? s;
  }
}
