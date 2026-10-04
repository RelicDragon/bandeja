/**
 * Tavily adapter (port of travel-bandeja `providers/tavilySearch.js`).
 * LLM-oriented search; returns per-result content plus an optional synthesized `answer`.
 *
 * Deviation: the key goes only in the `Authorization` header, never in the JSON body.
 */
import { WebSearchError, classifyHttpError, networkError } from '../webSearchError';
import {
  MAX_ANSWER_CHARS,
  clampCount,
  clipText,
  normalizeResults,
  timeoutSignal,
  type WebSearchProvider,
} from '../providerUtils';

export const TAVILY_ENDPOINT = 'https://api.tavily.com/search';

export const tavilyProvider: WebSearchProvider = {
  name: 'tavily',
  keyed: true,

  isConfigured(env) {
    return Boolean(env.tavilyApiKey);
  },

  async search({ query, count, fetchImpl, signal, env }) {
    if (!env.tavilyApiKey) throw new WebSearchError('Tavily API key not configured', { kind: 'auth', provider: 'tavily' });
    const clamped = clampCount(count);
    let response: Response;
    try {
      response = await fetchImpl(TAVILY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${env.tavilyApiKey}`,
        },
        body: JSON.stringify({ query, max_results: clamped, search_depth: 'basic', include_answer: true }),
        signal: timeoutSignal(env.searchTimeoutMs, signal),
      });
    } catch (err) {
      throw networkError('tavily', err);
    }
    if (!response.ok) {
      const { kind, retryAfterMs } = classifyHttpError(response.status, response.headers);
      throw new WebSearchError(`Tavily API error (${response.status})`, { kind, retryAfterMs, status: response.status, provider: 'tavily' });
    }
    let body: { results?: unknown; answer?: unknown };
    try {
      body = (await response.json()) as typeof body;
    } catch {
      throw new WebSearchError('Tavily returned non-JSON', { kind: 'unknown', provider: 'tavily' });
    }
    const results = normalizeResults(body?.results, clamped);
    const answer = typeof body?.answer === 'string' ? clipText(body.answer, MAX_ANSWER_CHARS) : '';
    return answer ? { results, answer } : { results };
  },
};
