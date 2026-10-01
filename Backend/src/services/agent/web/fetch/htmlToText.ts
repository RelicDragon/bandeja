/**
 * HTML → readable text for `web_fetch` (docs/plans/ai-agent-web-search.md §13.7.4).
 *
 * Replaces travel-bandeja's `contentExtractor.js` (cheerio + Readability + linkedom)
 * without new dependencies (decision D4): junk elements removed, main content picked
 * (`<article>` → `<main>` → `role="main"` → `<body>`), block tags turned into line breaks,
 * entities decoded, whitespace normalized, truncated at a word boundary. Pure: string in,
 * object out. The model only ever gets plain text, never HTML.
 */

export const TITLE_MAX_CHARS = 200;
export const DESCRIPTION_MAX_CHARS = 400;

export type ExtractedPage = {
  title: string | null;
  description: string | null;
  text: string;
  truncated: boolean;
};

const JUNK_ELEMENTS = [
  'script',
  'style',
  'noscript',
  'template',
  'iframe',
  'object',
  'embed',
  'svg',
  'canvas',
  'form',
  'select',
  'textarea',
  'button',
  'nav',
  'footer',
  'aside',
  'header',
  'dialog',
];

const BLOCK_TAGS =
  'p|div|br|hr|li|ul|ol|dl|dt|dd|h[1-6]|tr|table|thead|tbody|section|article|main|blockquote|pre|figure|figcaption|address|details|summary';

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  middot: '·',
  copy: '©',
  reg: '®',
  trade: '™',
  euro: '€',
  pound: '£',
  yen: '¥',
  deg: '°',
  times: '×',
  divide: '÷',
  shy: '',
  zwnj: '',
  zwj: '',
  eacute: 'é',
  egrave: 'è',
  aacute: 'á',
  agrave: 'à',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  ntilde: 'ñ',
  ccedil: 'ç',
  uuml: 'ü',
  ouml: 'ö',
  auml: 'ä',
  szlig: 'ß',
};

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]{1,31});/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '';
      return String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

function clip(text: string | null | undefined, max: number): string | null {
  if (!text) return null;
  const clean = decodeHtmlEntities(text).replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function metaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const re = new RegExp(`<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${key}["'][^>]*>`, 'i');
    const tag = re.exec(html)?.[0];
    if (!tag) continue;
    const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const value = content?.[1] ?? content?.[2];
    if (value && value.trim()) return value;
  }
  return null;
}

function removeElements(html: string, tags: string[]): string {
  let out = html;
  for (const tag of tags) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), ' ');
    out = out.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), ' '); // unclosed / void leftovers
  }
  return out;
}

function innerOf(html: string, pattern: RegExp): string | null {
  const m = pattern.exec(html);
  return m && m[1].replace(/<[^>]*>/g, '').trim() ? m[1] : null;
}

/** Drops C0 controls (except tab / newline / CR), DEL, zero-width space and BOM. */
function stripInvisible(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    const control = (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0x7f;
    if (!control && code !== 0x200b && code !== 0xfeff) out += ch;
  }
  return out;
}

function cleanText(input: string): string {
  return stripInvisible(input)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v\u00A0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Cut at a word boundary near `maxChars`; marks truncation. */
export function truncateText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (!text || text.length <= maxChars) return { text: text || '', truncated: false };
  const slice = text.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace >= Math.floor(maxChars * 0.8) ? lastSpace : maxChars;
  return { text: `${slice.slice(0, cut).trimEnd()}\n…[truncated]`, truncated: true };
}

export function plainTextToPage(text: string, maxChars: number): ExtractedPage {
  const { text: body, truncated } = truncateText(cleanText(text), maxChars);
  return { title: null, description: null, text: body, truncated };
}

export function htmlToText(html: string, maxChars: number): ExtractedPage {
  if (!html || typeof html !== 'string') return { title: null, description: null, text: '', truncated: false };
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, ' ');
  const title = clip(
    metaContent(withoutComments, ['og:title', 'twitter:title']) ?? /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(withoutComments)?.[1],
    TITLE_MAX_CHARS,
  );
  const description = clip(metaContent(withoutComments, ['og:description', 'description', 'twitter:description']), DESCRIPTION_MAX_CHARS);

  const stripped = removeElements(withoutComments.replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/i, ' '), JUNK_ELEMENTS);
  const root =
    innerOf(stripped, /<article\b[^>]*>([\s\S]*?)<\/article\s*>/i) ??
    innerOf(stripped, /<main\b[^>]*>([\s\S]*?)<\/main\s*>/i) ??
    innerOf(stripped, /<(?:div|section)\b[^>]*role\s*=\s*["']main["'][^>]*>([\s\S]*)/i) ??
    innerOf(stripped, /<body\b[^>]*>([\s\S]*?)(?:<\/body\s*>|$)/i) ??
    stripped;

  const text = root
    .replace(/<\/li\s*>/gi, '')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(new RegExp(`<\\/?(?:${BLOCK_TAGS})\\b[^>]*>`, 'gi'), '\n')
    .replace(/<(?:td|th)\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '');
  const { text: body, truncated } = truncateText(cleanText(decodeHtmlEntities(text)), maxChars);
  return { title, description, text: body, truncated };
}

/** First 2 KB look like an HTML document (for a missing / octet-stream content type). */
export function looksLikeHtml(head: string): boolean {
  let s = head.replace(/^\uFEFF/, '').trimStart();
  for (let i = 0; i < 8 && s.startsWith('<!--'); i += 1) {
    const end = s.indexOf('-->');
    if (end === -1) break;
    s = s.slice(end + 3).trimStart();
  }
  return /^(<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>])/i.test(s);
}
