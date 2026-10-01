/**
 * Test-only helpers for the web search / fetch unit tests (no network, no DB).
 */
import { resolveAgentWebEnvConfig, type AgentWebEnvConfig } from '../../../../config/agentWebEnv';

type TestCase = { name: string; fn: () => void | Promise<void> };

/** Tiny sequential runner: the modules under test keep per-instance state. */
export function createSuite(file: string) {
  const cases: TestCase[] = [];
  return {
    test(name: string, fn: () => void | Promise<void>) {
      cases.push({ name, fn });
    },
    async run() {
      let failed = 0;
      let finished = false;
      // AbortSignal.timeout timers are unref'd: without a ref'd handle a test waiting only
      // on one would let the process exit early with code 0 and no output.
      const keepAlive = setInterval(() => undefined, 1_000);
      process.on('exit', (code) => {
        if (!finished && code === 0) {
          console.error(`${file}: exited before all tests finished`);
          process.exitCode = 1;
        }
      });
      for (const c of cases) {
        try {
          await c.fn();
        } catch (error) {
          failed += 1;
          console.error(`FAIL ${file}: ${c.name}`);
          console.error(error);
        }
      }
      finished = true;
      clearInterval(keepAlive);
      if (failed) {
        console.error(`${file}: ${failed} of ${cases.length} failed`);
        process.exit(1);
      }
      console.log(`${file}: ok (${cases.length} tests)`);
    },
  };
}

/** Env with fake keys (never real ones) plus overrides. */
export function testEnv(overrides: Record<string, string | undefined> = {}): AgentWebEnvConfig {
  return resolveAgentWebEnvConfig({
    TAVILY_API_KEY: 'test-tavily-key',
    BRAVE_SEARCH_API_KEY: 'test-brave-key',
    ...overrides,
  } as NodeJS.ProcessEnv);
}

export type ScriptedResponse = {
  status?: number;
  headers?: Record<string, string>;
  json?: unknown;
  text?: string;
};

export type RecordedCall = { url: string; init: RequestInit | undefined };

function toResponse(res: ScriptedResponse | undefined): Response {
  if (!res) return new Response(JSON.stringify({ error: 'no scripted response' }), { status: 500 });
  const status = res.status ?? 200;
  const body = res.text ?? (res.json === undefined ? '' : JSON.stringify(res.json));
  // 204/304-like statuses can't carry a body in the Response constructor.
  const allowsBody = ![101, 204, 205, 304].includes(status);
  return new Response(allowsBody ? body : null, { status, headers: res.headers });
}

/** Routes by provider host; each route is a queue of scripted responses. */
export function makeRouterFetch(routes: Partial<Record<'tavily' | 'brave' | 'duckduckgo', ScriptedResponse[]>>) {
  const calls: Record<'tavily' | 'brave' | 'duckduckgo' | 'unknown', RecordedCall[]> = {
    tavily: [],
    brave: [],
    duckduckgo: [],
    unknown: [],
  };
  const queues = {
    tavily: [...(routes.tavily ?? [])],
    brave: [...(routes.brave ?? [])],
    duckduckgo: [...(routes.duckduckgo ?? [])],
  };
  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    const key = url.includes('tavily.com')
      ? 'tavily'
      : url.includes('search.brave.com')
        ? 'brave'
        : url.includes('duckduckgo.com')
          ? 'duckduckgo'
          : 'unknown';
    calls[key].push({ url, init });
    if (key === 'unknown') return toResponse(undefined);
    return toResponse(queues[key].shift());
  };
  return { fetchImpl, calls };
}

export const TAVILY_OK: ScriptedResponse = {
  json: { answer: 'Padel is a racket sport.', results: [{ title: 'T', url: 'https://tavily.example.org/r', content: 'tavily snippet' }] },
};
export const BRAVE_OK: ScriptedResponse = {
  json: { web: { results: [{ title: 'B', url: 'https://brave.example.org/r', description: 'brave snippet', type: 'search_result' }] } },
};
export const DDG_OK: ScriptedResponse = {
  text: '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fddg.example.org%2Fr">D</a><a class="result__snippet">ddg snippet</a>',
};
export const RATE_LIMITED = (retryAfter?: number): ScriptedResponse => ({
  status: 429,
  headers: retryAfter != null ? { 'retry-after': String(retryAfter) } : {},
});

export function makeClock(start = 1_000_000) {
  let t = start;
  const now = () => t;
  return Object.assign(now, { advance: (ms: number) => { t += ms; } });
}
