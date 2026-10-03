/**
 * Real-model evaluation suite for the in-app AI agent (docs/domains/agent.md § Tests → Real-model evals).
 *
 *   npm run eval:agent -- [--filter <regex>] [--locale en,ru] [--area writes,safety]
 *                         [--repeat N] [--concurrency 1-3] [--compare reports/<file>.json]
 *                         [--env KEY=VALUE ...] [--list] [--verbose]
 *
 * This file only sets the environment (passthrough, eval defaults, network stubs) BEFORE
 * any app module loads, then hands over to `main.ts`.
 */
import path from 'node:path';
import dotenv from 'dotenv';
import { installEvalFetch } from './stubs';

export type EvalArgs = {
  filter: string | null;
  locales: string[] | null;
  areas: string[] | null;
  repeat: number;
  concurrency: number;
  compare: string | null;
  out: string | null;
  env: Record<string, string>;
  list: boolean;
  verbose: boolean;
  argv: string[];
};

function parseArgs(argv: string[]): EvalArgs {
  const args: EvalArgs = { filter: null, locales: null, areas: null, repeat: 1, concurrency: 3, compare: null, out: null, env: {}, list: false, verbose: false, argv };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = () => {
      const next = argv[i + 1];
      if (next === undefined) throw new Error(`${flag} needs a value`);
      i += 1;
      return next;
    };
    switch (flag) {
      case '--filter':
        args.filter = value();
        break;
      case '--locale':
        args.locales = value().split(',').map((s) => s.trim()).filter(Boolean);
        break;
      case '--area':
        args.areas = value().split(',').map((s) => s.trim()).filter(Boolean);
        break;
      case '--repeat':
        args.repeat = Math.max(1, Math.min(20, Number.parseInt(value(), 10) || 1));
        break;
      case '--concurrency':
        args.concurrency = Math.max(1, Math.min(3, Number.parseInt(value(), 10) || 3));
        break;
      case '--compare':
        args.compare = path.resolve(value());
        break;
      case '--out':
        args.out = path.resolve(value());
        break;
      case '--env': {
        const pair = value();
        const eq = pair.indexOf('=');
        if (eq <= 0) throw new Error(`--env expects KEY=VALUE, got ${pair}`);
        args.env[pair.slice(0, eq)] = pair.slice(eq + 1);
        break;
      }
      case '--list':
        args.list = true;
        break;
      case '--verbose':
        args.verbose = true;
        break;
      default:
        throw new Error(`unknown flag ${flag}`);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
for (const [key, value] of Object.entries(args.env)) process.env[key] = value;
// dotenv never overrides variables that are already set, so passthrough wins.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Eval defaults: web search answers come from the stub (any non-empty key routes there),
// web_fetch is off (its pinned dispatcher bypasses the fetch stub), Brave off for determinism.
process.env.TAVILY_API_KEY = 'eval-stub-key';
process.env.BRAVE_SEARCH_API_KEY = '';
process.env.AGENT_WEB_SEARCH_DDG_ENABLED = 'false';
if (!('AGENT_WEB_FETCH_ENABLED' in args.env)) process.env.AGENT_WEB_FETCH_ENABLED = 'false';
// The eval user burns ~2M tokens per full pass; web tools read the daily budget from env
// (config.agent), not from the run service's overridden config.
if (!('AGENT_DAILY_TOKEN_BUDGET' in args.env)) process.env.AGENT_DAILY_TOKEN_BUDGET = '100000000';

installEvalFetch(process.env.AGENT_BASE_URL?.trim() || 'https://api.deepseek.com');

// App modules (config, prisma, agent services) load only now, after the env is final.
import('./main')
  .then(({ main }) => main(args))
  .then(
  (code) => process.exit(code),
  (error) => {
    console.error('[agent-eval] crashed', error);
    process.exit(2);
  },
);
