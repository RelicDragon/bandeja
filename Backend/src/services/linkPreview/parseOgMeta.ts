export type ParsedOgMeta = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
};

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    });
}

function cleanText(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = decodeHtmlEntities(value).replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 300);
}

function metaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(
        `<meta\\s+[^>]*?(?:property|name)=["']${escaped}["'][^>]*?content=["']([^"']*)["'][^>]*?/?>`,
        'i'
      ),
      new RegExp(
        `<meta\\s+[^>]*?content=["']([^"']*)["'][^>]*?(?:property|name)=["']${escaped}["'][^>]*?/?>`,
        'i'
      ),
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]) return m[1];
    }
  }
  return null;
}

function documentTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m?.[1] ? m[1] : null;
}

function resolveUrl(raw: string | null, baseUrl: string): string | null {
  if (!raw) return null;
  const cleaned = decodeHtmlEntities(raw).trim();
  if (!cleaned) return null;
  try {
    const resolved = new URL(cleaned, baseUrl);
    if (resolved.protocol !== 'https:') return null;
    if (resolved.username || resolved.password) return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

/** Extract Open Graph / Twitter / title meta from HTML (head-sized). */
export function parseOgMeta(html: string, baseUrl: string): ParsedOgMeta {
  const headEnd = html.search(/<\/head>/i);
  const slice = headEnd >= 0 ? html.slice(0, headEnd + 7) : html.slice(0, 120_000);

  const title =
    cleanText(metaContent(slice, ['og:title', 'twitter:title'])) ??
    cleanText(documentTitle(slice));
  const description = cleanText(
    metaContent(slice, ['og:description', 'twitter:description', 'description'])
  );
  const imageUrl = resolveUrl(
    metaContent(slice, ['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']),
    baseUrl
  );
  const siteName = cleanText(metaContent(slice, ['og:site_name']));

  return { title, description, imageUrl, siteName };
}
