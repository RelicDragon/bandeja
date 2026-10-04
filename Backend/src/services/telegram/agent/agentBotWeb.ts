/**
 * Web sources block under a Telegram assistant answer (Phase 13). Pure; built only from the server's `web` views
 * of this run's `web_search` / `web_fetch` steps, never from model text.
 *
 *   🔎 Web search (Brave, cached)
 *   • <a href="…">Title</a> — host
 *   📄 Read: <a href="…">host</a>, …
 *
 * http(s) links only, escaped, de-duplicated across searches, at most 5 per search and 8 in
 * total, and capped in characters with "…and N more".
 */
import type { AgentWebView } from '@bandeja/shared/agentContract';
import { agentBotT } from './agentBotCopy';
import { escapeTelegramHtml } from './agentTelegramHtml';

export const WEB_LINKS_PER_SEARCH = 5;
export const WEB_LINKS_MAX = 8;
/** HTML characters for the whole block. */
export const WEB_BLOCK_MAX_CHARS = 1500;
const TITLE_MAX = 80;

const PROVIDER_LABELS: Record<string, string> = { tavily: 'Tavily', brave: 'Brave', duckduckgo: 'DuckDuckGo' };

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function httpUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function anchor(url: string, label: string): string {
  return `<a href="${escapeTelegramHtml(url)}">${escapeTelegramHtml(label)}</a>`;
}

export function renderWebSourcesBlock(views: readonly AgentWebView[], lang: string): string {
  if (!views.length) return '';
  const lines: string[] = [];
  const seen = new Set<string>();
  let links = 0;
  let hidden = 0;
  let unavailableShown = false;
  let length = 0;
  const push = (line: string): boolean => {
    if (length + line.length + 1 > WEB_BLOCK_MAX_CHARS) return false;
    lines.push(line);
    length += line.length + 1;
    return true;
  };

  for (const view of views) {
    if (view.kind !== 'search') continue;
    if (view.exhausted) {
      if (!unavailableShown) push(escapeTelegramHtml(agentBotT('web.unavailable', lang)));
      unavailableShown = true;
      continue;
    }
    const fresh = view.results
      .map((r) => ({ ...r, url: httpUrl(r.url) }))
      .filter((r): r is typeof r & { url: string } => Boolean(r.url) && !seen.has(r.url as string));
    if (!fresh.length) continue;
    const provider = view.provider ? (PROVIDER_LABELS[view.provider] ?? view.provider) : '—';
    if (!push(escapeTelegramHtml(agentBotT(view.cached ? 'web.searchCached' : 'web.search', lang, { provider })))) break;
    fresh.forEach((result, index) => {
      if (index >= WEB_LINKS_PER_SEARCH || links >= WEB_LINKS_MAX) {
        hidden += 1;
        return;
      }
      const line = `• ${anchor(result.url, clip(result.title || result.host, TITLE_MAX))} — ${escapeTelegramHtml(result.host)}`;
      if (push(line)) {
        seen.add(result.url);
        links += 1;
      } else {
        hidden += 1;
      }
    });
  }

  const reads = views
    .filter((v): v is Extract<AgentWebView, { kind: 'fetch' }> => v.kind === 'fetch')
    .map((v) => ({ url: httpUrl(v.url), host: v.host }))
    .filter((v): v is { url: string; host: string } => Boolean(v.url));
  const readAnchors: string[] = [];
  for (const read of reads) {
    if (readAnchors.some((a) => a.includes(escapeTelegramHtml(read.url)))) continue;
    readAnchors.push(anchor(read.url, read.host));
  }
  if (readAnchors.length) {
    const line = `${escapeTelegramHtml(agentBotT('web.read', lang))} ${readAnchors.slice(0, 3).join(', ')}`;
    if (!push(line)) hidden += readAnchors.length;
    else hidden += Math.max(0, readAnchors.length - 3);
  }
  if (hidden > 0 && lines.length) push(escapeTelegramHtml(agentBotT('entity.more', lang, { count: hidden })));
  return lines.join('\n');
}
