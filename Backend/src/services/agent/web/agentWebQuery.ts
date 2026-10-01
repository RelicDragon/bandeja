/**
 * Personal-data check on `web_search` queries (docs/plans/ai-agent-web-search.md D6).
 * Runs before any provider call: a query with an email address, a phone-like digit run or
 * an internal id is refused (the provider would otherwise receive it).
 */
import { cleanSearchQuery } from './search/webSearchChain';

export type WebQueryRefusal = 'email' | 'phone' | 'id';

const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const PHONE_CANDIDATE = /\+?\(?\d[\d\s()./-]{7,}\d/g;

/**
 * Phone-like: 9+ digits that start with `+`, or are written as one run, or use phone
 * punctuation (`-./()`). Space-separated numbers ("2024 2025 2026") are left alone.
 */
function looksLikePhone(query: string): boolean {
  for (const match of query.matchAll(PHONE_CANDIDATE)) {
    const text = match[0];
    const digits = text.replace(/\D/g, '').length;
    if (digits < 9) continue;
    if (text.startsWith('+') || /^\d+$/.test(text) || /[()./-]/.test(text)) return true;
  }
  return false;
}
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
/** Prisma cuid ids (c + 24 lowercase alphanumerics). */
const CUID = /\bc[a-z0-9]{24}\b/;
/** App-internal refs (`geb:…`, `mirror:…`, signed slot refs `s1.…`). */
const APP_REF = /\b(?:geb|mirror):\S+|\bs1\.[A-Za-z0-9_-]{8,}/;

export function checkWebQuery(raw: string): { query: string } | { refused: WebQueryRefusal } {
  const query = cleanSearchQuery(raw);
  if (EMAIL.test(query)) return { refused: 'email' };
  if (looksLikePhone(query)) return { refused: 'phone' };
  if (UUID.test(query) || CUID.test(query) || APP_REF.test(query)) return { refused: 'id' };
  return { query };
}
