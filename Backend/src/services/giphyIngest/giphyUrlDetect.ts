import { isAllowedGiphyHost, isGiphyMediaHost } from './giphyHosts';

const URL_ONLY_RE =
  /^(?:<(https:\/\/[^>\s]+)>\s*|(https:\/\/\S+))$/i;

/** GIF id segment used by Giphy (alphanumeric, typically 10–20 chars). */
const GIF_ID_RE = /^[A-Za-z0-9]{4,64}$/;

/**
 * If trimmed content is exactly one allowlisted Giphy HTTPS URL (optional `<>` wrap),
 * return the normalized URL string. Otherwise null (no conversion).
 */
export function detectGiphyUrlOnly(content: string | null | undefined): string | null {
  if (content == null) return null;
  // Strip BOM / zero-width chars common in mobile paste, then trim.
  const trimmed = content.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  if (!trimmed) return null;

  const m = URL_ONLY_RE.exec(trimmed);
  if (!m) return null;
  const raw = (m[1] ?? m[2] ?? '').trim();
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  if (!isAllowedGiphyHost(parsed.hostname)) return null;

  // Reject multi-URL paste that slipped past (spaces already blocked; also reject query spam edges)
  if (/\s/.test(raw)) return null;

  parsed.hash = '';
  return parsed.toString();
}

/**
 * Extract a Giphy media id from a page / embed / media path when possible.
 * Returns null for opaque media file URLs that should be fetched as-is.
 */
export function extractGiphyIdFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!isAllowedGiphyHost(parsed.hostname)) return null;

  const path = parsed.pathname;

  // /media/{id}/... or /media/{id}.gif
  const mediaMatch = path.match(/\/media\/([A-Za-z0-9]+)(?:\/|\.|$)/i);
  if (mediaMatch?.[1] && GIF_ID_RE.test(mediaMatch[1])) {
    return mediaMatch[1];
  }

  // /embed/{id}
  const embedMatch = path.match(/\/embed\/([A-Za-z0-9]+)\/?$/i);
  if (embedMatch?.[1] && GIF_ID_RE.test(embedMatch[1])) {
    return embedMatch[1];
  }

  // /gifs/{slug-or-id} — id is last segment after final '-' when slug present, else whole segment
  const gifMatch = path.match(/\/gifs\/([^/?#]+)\/?$/i);
  if (gifMatch?.[1]) {
    let segment: string;
    try {
      segment = decodeURIComponent(gifMatch[1]);
    } catch {
      return null;
    }
    const dash = segment.lastIndexOf('-');
    const candidate = dash >= 0 ? segment.slice(dash + 1) : segment;
    if (GIF_ID_RE.test(candidate)) return candidate;
  }

  return null;
}

/** True when the URL already points at a downloadable media asset (not a HTML page). */
export function isDirectGiphyMediaUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    (parsed.port && parsed.port !== '443') ||
    !isGiphyMediaHost(parsed.hostname)
  ) return false;
  const path = parsed.pathname.toLowerCase();
  return (
    /\.(gif|webp|png|jpe?g)$/i.test(path) ||
    /\/media\/[a-z0-9]+\/[^/]+\.(gif|webp|png|jpe?g)$/i.test(path) ||
    /\/media\/[a-z0-9]+\/giphy\.gif$/i.test(path)
  );
}

export function buildGiphyCdnGifUrl(gifId: string): string {
  return `https://media.giphy.com/media/${gifId}/giphy.gif`;
}
