/**
 * Manual smoke check of the agent web tools against the REAL services
 *. Not part of CI or any test script:
 * `npm run smoke:agent-web` (reads Backend/.env).
 *
 * One trivial query to Tavily and one to Brave, straight through the adapters (no chain,
 * cache or rotation), plus one page fetch through the SSRF-guarded fetcher. Prints only
 * ok / failed with a kind and a count: never a key, a query response body or page text.
 */
import 'dotenv/config';
import { agentWebEnv } from '../src/config/agentWebEnv';
import { fetchWebPage } from '../src/services/agent/web/fetch/webFetchService';
import type { WebSearchProvider } from '../src/services/agent/web/search/providerUtils';
import { braveProvider } from '../src/services/agent/web/search/providers/brave';
import { tavilyProvider } from '../src/services/agent/web/search/providers/tavily';
import { classifyError } from '../src/services/agent/web/search/webSearchError';

const QUERY = 'padel';
const FETCH_URL = 'https://en.wikipedia.org/wiki/Padel';

async function checkProvider(provider: WebSearchProvider): Promise<boolean> {
  const env = agentWebEnv();
  if (!provider.isConfigured(env)) {
    console.log(`${provider.name}: skipped (no key)`);
    return false;
  }
  try {
    const res = await provider.search({ query: QUERY, count: 3, fetchImpl: (url, init) => fetch(url, init), env });
    console.log(`${provider.name}: ok (${res.results.length} results${res.answer ? ', answer' : ''})`);
    return res.results.length > 0;
  } catch (error) {
    console.log(`${provider.name}: failed (${classifyError(error).kind})`);
    return false;
  }
}

async function main(): Promise<void> {
  const results = [await checkProvider(tavilyProvider), await checkProvider(braveProvider)];
  const page = await fetchWebPage(FETCH_URL);
  console.log(page.ok ? `web_fetch: ok (${page.charCount} chars)` : `web_fetch: failed (${page.code})`);
  process.exitCode = results.every(Boolean) && page.ok ? 0 : 1;
}

void main();
