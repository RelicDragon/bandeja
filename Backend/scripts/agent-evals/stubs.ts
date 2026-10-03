/**
 * Outbound network for the eval process. Installed before any app module creates a client.
 *
 * - DeepSeek (`AGENT_BASE_URL` host): passed through to the real API. The SSE body is teed
 *   and its final `usage` chunk parsed so cached prompt tokens are measured whether or not
 *   the app surfaces them (`prompt_cache_hit_tokens`, or `prompt_tokens_details.cached_tokens`).
 * - Open-Meteo forecast / archive: a deterministic fake (rain 18:00–20:00 local).
 * - Tavily / Brave: canned search results and images, so `web_search` / `web_images` work
 *   without a real key or a real query leaving the machine.
 * - Everything else (booking providers, DuckDuckGo, random hosts): a network error. The
 *   fixture clubs have no booking integration, so the slot engine stays on app data.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { formatInTimeZone } from 'date-fns-tz';

export type EvalCaseScope = { caseKey: string; deepseek: DeepSeekUsageRecord[]; pending: Promise<void>[] };
export type DeepSeekUsageRecord = {
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
};

/** Per-case attribution for outbound calls (the run loop inherits the async context). */
export const evalScope = new AsyncLocalStorage<EvalCaseScope>();

export const blockedCalls: string[] = [];
export const stubCalls = { openMeteo: 0, tavily: 0, brave: 0, deepseek: 0 };

const STUB_TZ = 'Europe/Belgrade';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function forecastBody(): unknown {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - 1);
  const time: string[] = [];
  const temperature: number[] = [];
  const code: number[] = [];
  const pop: number[] = [];
  const precipitation: number[] = [];
  for (let i = 0; i < 24 * 17; i += 1) {
    const at = new Date(start.getTime() + i * 3_600_000);
    time.push(at.toISOString().slice(0, 16));
    const hour = Number(formatInTimeZone(at, STUB_TZ, 'H'));
    temperature.push(12 + Math.round(hour * 0.4));
    const evening = hour >= 18 && hour <= 20;
    code.push(evening ? 63 : 1);
    pop.push(evening ? 75 : 5);
    precipitation.push(evening ? 1.2 : 0);
  }
  return {
    hourly: {
      time,
      temperature_2m: temperature,
      weather_code: code,
      precipitation_probability: pop,
      precipitation,
      wind_speed_10m: time.map(() => 14),
      relative_humidity_2m: time.map(() => 60),
      is_day: time.map((t) => {
        const hour = Number(formatInTimeZone(new Date(`${t}Z`), STUB_TZ, 'H'));
        return hour >= 7 && hour <= 19 ? 1 : 0;
      }),
    },
  };
}

function archiveBody(day: string): unknown {
  const time = Array.from({ length: 24 }, (_, h) => `${day}T${String(h).padStart(2, '0')}:00`);
  return {
    hourly: {
      time,
      temperature_2m: time.map(() => 16),
      weather_code: time.map(() => 3),
      precipitation: time.map(() => 0),
      wind_speed_10m: time.map(() => 10),
      relative_humidity_2m: time.map(() => 55),
      is_day: time.map(() => 1),
    },
  };
}

const SEARCH_RESULTS = [
  {
    title: 'Padel rules: the serve (International Padel Federation)',
    url: 'https://www.padelfip.com/rules/serve',
    content:
      'The serve must be made underhand: the ball is hit at or below waist height after one bounce behind the service line, diagonally into the opponent service box. Two attempts are allowed.',
  },
  {
    title: 'World Padel Tour vs Premier Padel explained',
    url: 'https://www.padel-magazine.example/premier-padel',
    content: 'Premier Padel is the professional circuit run with the FIP since 2023; the World Padel Tour ended after 2023.',
  },
  {
    title: 'How to choose a padel racket',
    url: 'https://www.padel-gear.example/rackets',
    content: 'Round rackets give control, diamond rackets give power, teardrop is in between. Weight 355–375 g suits most players.',
  },
];

function tavilyBody(request: string): unknown {
  let wantsImages = false;
  try {
    wantsImages = Boolean((JSON.parse(request) as { include_images?: boolean }).include_images);
  } catch {
    wantsImages = false;
  }
  return {
    answer: 'In padel the serve is underhand, below the waist, after a bounce, diagonally into the service box.',
    results: SEARCH_RESULTS,
    ...(wantsImages
      ? {
          images: [
            { url: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Padel_court.jpg', description: 'A padel court' },
            { url: 'https://upload.wikimedia.org/wikipedia/commons/b/b2/Padel_racket.jpg', description: 'A padel racket' },
          ],
        }
      : {}),
  };
}

function braveBody(isImages: boolean): unknown {
  if (isImages) {
    return {
      results: [
        { title: 'Padel court', properties: { url: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Padel_court.jpg' }, url: 'https://commons.wikimedia.org/a' },
      ],
    };
  }
  return { web: { results: SEARCH_RESULTS.map((r) => ({ title: r.title, url: r.url, description: r.content })) } };
}

/** Reads the teed SSE body and records the last usage object for the current case. */
async function recordDeepSeekUsage(response: Response, scope: EvalCaseScope | undefined): Promise<void> {
  if (!scope || !response.body) return;
  try {
    const text = await response.text();
    let usage: Record<string, unknown> | null = null;
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const chunk = JSON.parse(payload) as { usage?: Record<string, unknown> | null };
        if (chunk.usage) usage = chunk.usage;
      } catch {
        // partial line; ignore
      }
    }
    if (!usage) return;
    const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
    const details = (usage.prompt_tokens_details ?? {}) as Record<string, unknown>;
    const promptTokens = num(usage.prompt_tokens);
    const cacheHitTokens = num(usage.prompt_cache_hit_tokens) || num(details.cached_tokens);
    const cacheMissTokens = num(usage.prompt_cache_miss_tokens) || Math.max(0, promptTokens - cacheHitTokens);
    scope.deepseek.push({ promptTokens, completionTokens: num(usage.completion_tokens), cacheHitTokens, cacheMissTokens });
  } catch {
    // aborted stream (timeout / cancel): no usage
  }
}

export function installEvalFetch(llmBaseUrl: string): void {
  const realFetch = globalThis.fetch;
  const llmHost = new URL(llmBaseUrl).hostname;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw);
    if (url.hostname === llmHost) {
      stubCalls.deepseek += 1;
      const scope = evalScope.getStore();
      const response = await realFetch(input as RequestInfo, init);
      if (!response.body) return response;
      const [forApp, forUs] = response.body.tee();
      const recording = recordDeepSeekUsage(new Response(forUs, { headers: response.headers }), scope);
      scope?.pending.push(recording);
      return new Response(forApp, { status: response.status, statusText: response.statusText, headers: response.headers });
    }
    if (url.hostname === 'api.open-meteo.com') {
      stubCalls.openMeteo += 1;
      return json(forecastBody());
    }
    if (url.hostname === 'archive-api.open-meteo.com') {
      stubCalls.openMeteo += 1;
      return json(archiveBody(url.searchParams.get('start_date') ?? new Date().toISOString().slice(0, 10)));
    }
    if (url.hostname === 'api.tavily.com') {
      stubCalls.tavily += 1;
      const body = typeof init?.body === 'string' ? init.body : '';
      return json(tavilyBody(body));
    }
    if (url.hostname === 'api.search.brave.com') {
      stubCalls.brave += 1;
      return json(braveBody(url.pathname.includes('/images/')));
    }
    blockedCalls.push(`${url.hostname}${url.pathname}`);
    throw new TypeError(`fetch failed (blocked by agent eval: ${url.hostname})`);
  }) as typeof fetch;
}
