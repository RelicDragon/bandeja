/**
 * Brave Search adapter (port of travel-bandeja `providers/braveSearch.js`).
 * Independent index, plain results.
 */
import { WebSearchError, classifyHttpError, networkError } from '../webSearchError';
import { clampCount, normalizeResults, timeoutSignal, type WebSearchProvider } from '../providerUtils';

export const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

export const braveProvider: WebSearchProvider = {
  name: 'brave',
  keyed: true,

  isConfigured(env) {
    return Boolean(env.braveApiKey);
  },

  async search({ query, count, fetchImpl, signal, env }) {
    if (!env.braveApiKey) throw new WebSearchError('Brave API key not configured', { kind: 'auth', provider: 'brave' });
    const clamped = clampCount(count);
    const url = new URL(BRAVE_ENDPOINT);
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(clamped));
    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json', 'X-Subscription-Token': env.braveApiKey },
        signal: timeoutSignal(env.searchTimeoutMs, signal),
      });
    } catch (err) {
      throw networkError('brave', err);
    }
    if (!response.ok) {
      const { kind, retryAfterMs } = classifyHttpError(response.status, response.headers);
      throw new WebSearchError(`Brave API error (${response.status})`, { kind, retryAfterMs, status: response.status, provider: 'brave' });
    }
    let body: { web?: { results?: unknown } };
    try {
      body = (await response.json()) as typeof body;
    } catch {
      throw new WebSearchError('Brave returned non-JSON', { kind: 'unknown', provider: 'brave' });
    }
    // Brave mixes organic results with videos, news, etc. Keep only real web hits.
    const raw = Array.isArray(body?.web?.results) ? (body.web.results as unknown[]) : [];
    const organic = raw.filter((r) => {
      const type = (r as { type?: unknown } | null)?.type;
      return r != null && (type === undefined || type === 'search_result');
    });
    return { results: normalizeResults(organic, clamped) };
  },
};
