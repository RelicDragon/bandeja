/**
 * Built-in agent tool server: an in-process registry of MCP-style tool definitions
 * (docs/plans/ai-agent.md §1, §5).
 *
 * Rules every tool follows:
 *   - The handler authorizes against `ctx.principal` (DB-loaded at run start). No tool
 *     accepts a user id / actor argument for "who am I".
 *   - Output is an agent-specific DTO (`services/agent/dto/`), never a raw Prisma row.
 *   - `kind: 'write'` tools never mutate directly: they validate, check permission and
 *     return `awaitingConfirmation` with a saved `AgentPendingAction` id (phase 3).
 *   - `scope: 'admin'` tools are not even listed to non-admins, and `executeTool`
 *     refuses them for non-admins exactly like an unknown tool.
 *
 * `executeTool` never throws into the run loop: bad args, ApiErrors (404 stays the same
 * generic "not found") and crashes all come back as `{ ok: false, data: { error } }`.
 */
import { fromZonedTime } from 'date-fns-tz';
import { z } from 'zod/v4';
import type {
  AgentEntityRef,
  AgentToolRiskTier as AgentToolRiskTierContract,
  AgentWebView,
} from '@bandeja/shared/agentContract';
import { ApiError } from '../../../utils/ApiError';
import type { AgentPrincipal } from '../access/agentPrincipal';
import type { AgentWebRunSession } from '../web/agentWebSession';
import { agentT } from '../i18n/agentI18n';

export type AgentToolKind = 'read' | 'write';
export type AgentToolScope = 'user' | 'admin';
/**
 * Write tools only (plan §15): `standard` may be stored as ALWAYS_ALLOW by the user (the
 * write then executes without a tap, still re-authorized); `critical` always asks.
 */
export type AgentToolRiskTier = AgentToolRiskTierContract;

export type AgentToolContext = {
  principal: AgentPrincipal;
  /** Reply / label language (`X-App-Locale` → user language → `en`). */
  locale: string;
  /** Home city timezone (IANA), `UTC` when unknown. Date-only args are read in it. */
  timezone: string;
  now: Date;
  runId?: string;
  chatId?: string;
  /** The model's tool call id (write tools report the confirm outcome under it). */
  callId?: string;
  /**
   * Capabilities of the client that sent the message (`X-Agent-Client-Caps`, stored on the
   * run). Empty for Telegram and old app builds. Use `supportsClientExecution(ctx)`.
   */
  clientCaps?: readonly string[];
  /**
   * The definition being executed (set by `executeTool`). `proposeAgentAction` reads its
   * `riskTier` / `escalate`; without it a proposal is treated as critical (never auto-approved).
   */
  tool?: AgentToolDefinition;
  signal?: AbortSignal;
  /** Per-run web tool state (call counts, URLs a search returned); set by the run loop. */
  web?: AgentWebRunSession;
};

export type AgentToolResult = {
  /** JSON sent back to the model. Keep it small and free of private fields. */
  data: unknown;
  /** Short human line for the UI chip ("Found 4 games"). Server-written. */
  summary: string;
  entities?: AgentEntityRef[];
  /**
   * A refusal the handler answered itself (limit reached, URL not allowed…): `data` carries
   * the error for the model, `summary` the localized line, and the call counts as failed
   * (`ok: false`, so it never taints the run). Throwing stays the way to report ApiErrors.
   */
  failed?: boolean;
  /** UI view of a web tool step (`web_search` / `web_fetch`), copied to the event and block. */
  web?: AgentWebView;
  /**
   * Write tools (phase 3): the pending action this call created. The run loop emits
   * `action.pending` and ends the run as `AWAITING_CONFIRMATION`.
   */
  awaitingConfirmation?: { actionId: string };
};

/** Context of a confirmed write: the principal is re-loaded from the DB at confirm time. */
export type AgentWriteContext = {
  principal: AgentPrincipal;
  locale: string;
  timezone: string;
  now: Date;
};

export type AgentWriteOutcome = {
  /** Localised result line for the action card. */
  message: string;
  entities?: AgentEntityRef[];
  /** Facts for the model (ids, ISO times). Server data only; no user-written text. */
  modelData?: Record<string, unknown>;
  /**
   * Only part of the change happened (booking plan §14.6, e.g. "2 of 3 courts booked",
   * "Booked; game not created"). `message` must say what did and did not happen.
   */
  partial?: boolean;
  /**
   * The handler handled its own failure (e.g. rolled a booking back) and the action
   * closes FAILED with `message`. `changed: false` tells the model nothing was changed;
   * `changed: true` means something stayed changed and `message` says what.
   */
  failed?: { changed: boolean };
};

/**
 * Confirm half of a `kind: 'write'` tool (`agentActions.service.ts`). `plan` is the
 * server-built payload the handler stored on the `AgentPendingAction`; both functions
 * must parse it before use. `authorize` re-runs the propose-time guard against the
 * freshly loaded principal; `execute` calls the same service the HTTP route uses.
 */
export type AgentWriteConfirm = {
  authorize: (principal: AgentPrincipal, plan: unknown) => Promise<void>;
  execute: (ctx: AgentWriteContext, plan: unknown) => Promise<AgentWriteOutcome>;
};

export type AgentToolDefinition<S extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  kind: AgentToolKind;
  scope: AgentToolScope;
  /** Always a `.strict()` object: unknown keys (e.g. a `userId` actor) are rejected. */
  input: S;
  /** UI chip text while the tool runs. `args` is null when they failed validation. */
  label: (args: z.infer<S> | null, locale?: string) => string;
  handler: (ctx: AgentToolContext, args: z.infer<S>) => Promise<AgentToolResult>;
  /** Required for `kind: 'write'`, forbidden for reads. */
  confirm?: AgentWriteConfirm;
  /** Required for `kind: 'write'` (the registry test enforces it), forbidden for reads. */
  riskTier?: AgentToolRiskTier;
  /**
   * Per-call escalation of a `standard` write to `critical` (e.g. `update_game` changing
   * `isPublic`). `currentState` is whatever the handler passed to `proposeAgentAction`.
   */
  escalate?: (ctx: AgentToolContext, args: z.infer<S>, currentState: unknown) => 'critical' | undefined;
  /**
   * Write tools: one short capability line for the system prompt's "what you can change"
   * list (`agentContext.service.ts`). Optional; without it the prompt falls back to the
   * first sentence of `description`.
   */
  promptHint?: string;
  /**
   * Read tools that return text written by other people (game chat, web search / fetch).
   * A successful call taints the run: no write proposed later in that run auto-approves
   * (ALWAYS_ALLOW is ignored → normal confirmation card; `agentActionAutoApprove.ts`).
   */
  untrustedContent?: boolean;
  /**
   * Feature switch read on every listing and call (web tools: kill switch + keys). False →
   * the tool is not listed and a forged call answers `unknown_tool`.
   */
  isAvailable?: () => boolean;
};

const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;

function isToolAvailable(tool: Pick<AgentToolDefinition, 'isAvailable'>): boolean {
  if (!tool.isAvailable) return true;
  try {
    return tool.isAvailable();
  } catch {
    return false;
  }
}

export function defineTool<S extends z.ZodType>(definition: AgentToolDefinition<S>): AgentToolDefinition<S> {
  if (!TOOL_NAME_PATTERN.test(definition.name)) {
    throw new Error(`Invalid agent tool name "${definition.name}"`);
  }
  if (definition.kind !== 'read' && definition.kind !== 'write') {
    throw new Error(`Agent tool ${definition.name} must declare kind read|write`);
  }
  if (definition.scope !== 'user' && definition.scope !== 'admin') {
    throw new Error(`Agent tool ${definition.name} must declare scope user|admin`);
  }
  if ((definition.kind === 'write') !== Boolean(definition.confirm)) {
    throw new Error(`Agent tool ${definition.name}: write tools (and only they) define confirm`);
  }
  if (definition.kind === 'write' && definition.riskTier !== 'standard' && definition.riskTier !== 'critical') {
    throw new Error(`Agent tool ${definition.name}: write tools must declare riskTier standard|critical`);
  }
  if (definition.kind === 'read' && (definition.riskTier || definition.escalate)) {
    throw new Error(`Agent tool ${definition.name}: riskTier / escalate are for write tools only`);
  }
  if (definition.kind === 'write' && definition.untrustedContent) {
    throw new Error(`Agent tool ${definition.name}: untrustedContent is for read tools only`);
  }
  return definition;
}

/** OpenAI / DeepSeek `tools[]` entry. */
export type AgentOpenAiTool = {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export function toolJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

export type AgentToolExecution = {
  ok: boolean;
  /** What goes back to the model as the tool message content (JSON). */
  data: unknown;
  summary: string;
  label: string;
  entities?: AgentEntityRef[];
  web?: AgentWebView;
  awaitingConfirmation?: { actionId: string };
};

/** Generic answer for ids the principal may not see — identical to a missing id. */
export const AGENT_TOOL_NOT_FOUND = { error: 'not_found' } as const;

function apiErrorToToolData(error: ApiError): { error: string; message?: string } {
  if (error.statusCode === 404) return { ...AGENT_TOOL_NOT_FOUND };
  if (error.statusCode === 403) return { error: 'forbidden', message: error.message };
  if (error.statusCode === 401) return { error: 'unauthorized' };
  if (error.statusCode === 409) return { error: 'conflict', message: error.message };
  if (error.statusCode >= 400 && error.statusCode < 500) return { error: 'bad_request', message: error.message };
  return { error: 'internal_error' };
}

export class AgentToolRegistry {
  private readonly tools = new Map<string, AgentToolDefinition>();

  constructor(definitions: AgentToolDefinition[]) {
    for (const definition of definitions) {
      if (this.tools.has(definition.name)) {
        throw new Error(`Duplicate agent tool "${definition.name}"`);
      }
      this.tools.set(definition.name, definition);
    }
  }

  list(): AgentToolDefinition[] {
    return [...this.tools.values()];
  }

  get(name: string): AgentToolDefinition | undefined {
    return this.tools.get(name);
  }

  /** Tools the principal may see. Admin-scope tools are hidden from non-admins; switched-off tools from everyone. */
  toolsForPrincipal(principal: Pick<AgentPrincipal, 'isAdmin'>): AgentToolDefinition[] {
    return this.list().filter((tool) => (tool.scope === 'user' || principal.isAdmin) && isToolAvailable(tool));
  }

  openAiToolsFor(principal: Pick<AgentPrincipal, 'isAdmin'>): AgentOpenAiTool[] {
    return this.toolsForPrincipal(principal).map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: toolJsonSchema(tool.input),
      },
    }));
  }

  /** Label for a tool call before/while it runs; never throws. */
  labelFor(name: string, rawArgs: unknown, locale?: string): string {
    const tool = this.tools.get(name);
    if (!tool) return name;
    const parsed = tool.input.safeParse(rawArgs ?? {});
    try {
      return tool.label(parsed.success ? parsed.data : null, locale);
    } catch {
      return name;
    }
  }

  async executeTool(ctx: AgentToolContext, name: string, rawArgs: unknown): Promise<AgentToolExecution> {
    const tool = this.tools.get(name);
    const { locale } = ctx;
    if (!tool || (tool.scope === 'admin' && !ctx.principal.isAdmin) || !isToolAvailable(tool)) {
      return { ok: false, data: { error: 'unknown_tool', name }, summary: agentT(locale, 'error.unknownTool'), label: name };
    }
    const label = this.labelFor(name, rawArgs, ctx.locale);
    const parsed = tool.input.safeParse(rawArgs ?? {});
    if (!parsed.success) {
      return {
        ok: false,
        data: {
          error: 'invalid_arguments',
          issues: parsed.error.issues.slice(0, 5).map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
        summary: agentT(locale, 'error.invalid'),
        label,
      };
    }
    try {
      const result = await tool.handler({ ...ctx, tool }, parsed.data);
      return {
        ok: !result.failed,
        data: result.data,
        summary: result.summary,
        label,
        ...(result.entities?.length ? { entities: result.entities } : {}),
        ...(result.web ? { web: result.web } : {}),
        ...(result.awaitingConfirmation ? { awaitingConfirmation: result.awaitingConfirmation } : {}),
      };
    } catch (error) {
      if (error instanceof ApiError) {
        const data = apiErrorToToolData(error);
        const summaryKey =
          data.error === 'not_found'
            ? 'error.notFound'
            : data.error === 'forbidden' || data.error === 'unauthorized'
              ? 'error.forbidden'
              : data.error === 'internal_error'
                ? 'error.internal'
                : 'error.badRequest';
        return { ok: false, data, summary: agentT(locale, summaryKey), label };
      }
      console.error('[agent] tool crashed', { tool: name, error });
      return { ok: false, data: { error: 'internal_error' }, summary: agentT(locale, 'error.internal'), label };
    }
  }
}

/**
 * Parses an agent date argument. `YYYY-MM-DD` (and date-times without an offset) are
 * wall-clock in `timezone`; `endOfDay` turns a bare date into its last millisecond.
 * Returns null when invalid.
 */
export function parseAgentDate(
  value: string | undefined | null,
  timezone: string,
  options: { endOfDay?: boolean } = {},
): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  let date: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    date = fromZonedTime(`${trimmed}T${options.endOfDay ? '23:59:59.999' : '00:00:00.000'}`, timezone);
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(trimmed)) {
    date = fromZonedTime(trimmed, timezone);
  } else {
    date = new Date(trimmed);
  }
  return Number.isFinite(date.getTime()) ? date : null;
}
