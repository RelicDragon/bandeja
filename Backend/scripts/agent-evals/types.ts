import type { EvalFixture } from './fixtures';
import type { EvalLocale } from './language';

export type EvalArea =
  | 'reads'
  | 'writes'
  | 'booking'
  | 'money'
  | 'league'
  | 'results'
  | 'weather'
  | 'web'
  | 'memory'
  | 'safety'
  | 'multi';

export type ToolArgs = Record<string, unknown>;

export type ToolExpectation = {
  /** One name, or any of several (e.g. `list_my_games` | `get_game`). */
  name: string | string[];
  /** At least one call with this name must satisfy it. */
  args?: (args: ToolArgs, fx: EvalFixture) => boolean;
  label?: string;
  /** Count a call whose tool result was `ok: false` (default: only successful calls count). */
  allowError?: boolean;
};

export type ReplyCheck = {
  name: string;
  test: (reply: string, fx: EvalFixture) => boolean;
};

export type EvalCase = {
  /** Stable id: `<area>.<slug>.<locale>`. */
  id: string;
  area: EvalArea;
  /** Language of the user message = expected reply language. */
  locale: EvalLocale;
  /** Fixture principal. `memory` = a fresh scratch user per attempt, so memory writes don't leak across cases / repeats. */
  user?: 'main' | 'memory';
  /** `X-App-Locale` of the run (default `en`: the reply must follow the message, not the app). */
  appLocale?: string;
  /** Static prior turns written straight into the chat (no LLM call). */
  history?: { user: string; assistant: string }[];
  /** Live prior turns, each run through the real loop before `message`. Tool checks span all runs. */
  turns?: string[];
  message: string;
  expect: {
    /** Every expectation must be met (order-insensitive unless `ordered`). */
    tools?: ToolExpectation[];
    /** At least one of these must be met. */
    anyTools?: ToolExpectation[];
    ordered?: boolean;
    forbidTools?: string[];
    /**
     * `none` (default): no write tool called and no pending action.
     * Otherwise exactly this write must be proposed (PENDING card, run AWAITING_CONFIRMATION).
     * `any`: some write proposal is acceptable (and required).
     * `optional`: don't check writes (still never confirmed).
     */
    write?: 'none' | 'any' | 'optional' | { tool: string | string[]; args?: (args: ToolArgs, fx: EvalFixture) => boolean };
    reply?: ReplyCheck[];
    maxSteps?: number;
    /** false = don't check (e.g. the reply is mostly names). Default = `locale`. */
    language?: EvalLocale | false;
  };
  note?: string;
};

export type EvalCaseFactory = (fx: EvalFixture) => EvalCase[];

export type CheckResult = { name: string; ok: boolean | null; detail?: string };
