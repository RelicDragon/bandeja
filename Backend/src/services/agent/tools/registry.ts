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
 *   - `kind: 'memory'` tools (Phase 11, docs/plans/ai-agent-memory.md) touch only the
 *     user's own assistant memory: no confirmation card, never app data. They are listed
 *     only while the principal's memory switch is ON (`executeTool` refuses them like an
 *     unknown tool otherwise) and their handlers re-check the switch in the DB.
 *   - Tools with `isAvailable` (web tools: kill switch + provider keys) are neither listed
 *     nor callable while it returns false.
 *
 * `executeTool` never throws into the run loop: bad args, ApiErrors (404 stays the same
 * generic "not found") and crashes all come back as `{ ok: false, data: { error } }`.
 *
 * Per-call deadline: read handlers and write proposals get `ctx.toolTimeoutMs`
 * (`AGENT_TOOL_TIMEOUT_MS`, 15s) or the tool's own `timeoutMs`. The handler's `ctx.signal`
 * aborts at the deadline (or with the run), and a race returns `tool_timeout` even when a
 * handler ignores the signal. A proposal that still lands after its deadline is handed to
 * `ctx.discardLateProposal` (the run loop closes it unseen), so no orphan card waits. Memory
 * tools (DB only) and the execute phase of confirmed writes are never cut: a cut write could
 * still complete and be reported as failed.
 */
import { fromZonedTime } from 'date-fns-tz';
import { z } from 'zod/v4';
import type {
  AgentEntityRef,
  AgentStreamEvent,
  AgentToolCard,
  AgentToolRiskTier as AgentToolRiskTierContract,
  AgentWebImage,
  AgentWebView,
} from '@bandeja/shared/agentContract';
import { ApiError } from '../../../utils/ApiError';
import type { AgentPrincipal } from '../access/agentPrincipal';
import type { AgentWebRunSession } from '../web/agentWebSession';
import { agentT } from '../i18n/agentI18n';
import { agentWrongKindIdHints } from './agentIdHints';
import {
  AGENT_TOOL_GROUP_DESCRIPTIONS,
  AGENT_TOOL_GROUPS,
  LOAD_TOOLS_NAME,
  type AgentLoadableToolGroup,
  type AgentToolGroup,
} from './toolGroups';

/** `memory`: the user's own assistant memory (self-scoped, no card; see the header). */
export type AgentToolKind = 'read' | 'write' | 'memory';
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
  /**
   * Set by the run loop for every call (Phase 11 provenance guard, `agentMemory.service.ts`
   * `assertMemorySaveProvenance`). Missing = unknown = `save_memory` refuses (fail closed).
   */
  memoryProvenance?: AgentMemoryProvenance;
  /** Per-run web tool state (call counts, URLs a search returned); set by the run loop. */
  web?: AgentWebRunSession;
  /** Handler deadline (`AGENT_TOOL_TIMEOUT_MS`); a tool's own `timeoutMs` wins. Default `AGENT_TOOL_DEFAULT_TIMEOUT_MS`. */
  toolTimeoutMs?: number;
  /** A write proposal that resolved after its deadline (the model already got `tool_timeout`). */
  discardLateProposal?: (actionId: string) => Promise<void>;
};

export type AgentMemoryProvenance = {
  /**
   * Text written by other people is in the model's context: an `untrustedContent` read
   * returned content earlier in this run, or one was called anywhere in this chat's history.
   */
  untrustedContentInContext: boolean;
  /** The latest user message explicitly asks to remember something (`userAskedToRemember`). */
  userAskedToRemember: boolean;
};

/** Payload of the `memory.saved` run event a `save_memory` call emits (chip with Undo). */
export type AgentMemorySavedEvent = Extract<AgentStreamEvent, { type: 'memory.saved' }>['memory'];

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
  /** `web_images` pictures (server-built proxy paths), copied to the event and block. */
  images?: AgentWebImage[];
  /** Rich UI card (results, play intent, weather), copied to the event and block; never sent to the model. */
  card?: AgentToolCard;
  /**
   * Write tools (phase 3): the pending action this call created. The run loop emits
   * `action.pending` and ends the run as `AWAITING_CONFIRMATION`.
   */
  awaitingConfirmation?: { actionId: string };
  /** `save_memory` stored a memory: the run loop emits `memory.saved` (Phase 11). */
  memorySaved?: AgentMemorySavedEvent;
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
  /**
   * Tool group (`toolGroups.ts`), set where the tool is registered (`tools/index.ts`). With
   * tool groups on, only `core` and loaded groups are sent to the model. Missing = `core`.
   */
  group?: AgentToolGroup;
  /**
   * Handler deadline for this tool (ms), over `AGENT_TOOL_TIMEOUT_MS`: for tools whose own
   * upstream deadlines are longer (web search chain 15s, live provider availability).
   */
  timeoutMs?: number;
};

/** Handler deadline when the context sets none (`AGENT_TOOL_TIMEOUT_MS` default). */
export const AGENT_TOOL_DEFAULT_TIMEOUT_MS = 15_000;

const TOOL_TIMED_OUT = Symbol('tool_timeout');

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
  if (definition.kind !== 'read' && definition.kind !== 'write' && definition.kind !== 'memory') {
    throw new Error(`Agent tool ${definition.name} must declare kind read|write|memory`);
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
  if (definition.kind !== 'write' && (definition.riskTier || definition.escalate)) {
    throw new Error(`Agent tool ${definition.name}: riskTier / escalate are for write tools only`);
  }
  if (definition.kind !== 'read' && definition.untrustedContent) {
    throw new Error(`Agent tool ${definition.name}: untrustedContent is for read tools only`);
  }
  if (definition.kind === 'memory' && definition.scope !== 'user') {
    throw new Error(`Agent tool ${definition.name}: memory tools are user scope`);
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
  images?: AgentWebImage[];
  /** UI only: the run loop puts it on `tool.finished` and the `tool_result` block, never in `data`. */
  card?: AgentToolCard;
  awaitingConfirmation?: { actionId: string };
  memorySaved?: AgentMemorySavedEvent;
};

/**
 * Who may see a tool: admin scope needs an admin; memory tools need the switch ON (fail
 * closed); switched-off tools (`isAvailable` false, e.g. web tools without keys) nobody.
 */
export type AgentToolAudience = Pick<AgentPrincipal, 'isAdmin'> & Partial<Pick<AgentPrincipal, 'agentMemoryEnabled'>>;

function visibleTo(tool: AgentToolDefinition, principal: AgentToolAudience): boolean {
  if (tool.scope === 'admin' && !principal.isAdmin) return false;
  if (tool.kind === 'memory' && principal.agentMemoryEnabled !== true) return false;
  return isToolAvailable(tool);
}

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

export function agentToolGroupOf(tool: Pick<AgentToolDefinition, 'group'>): AgentToolGroup {
  return tool.group ?? 'core';
}

function toOpenAiTool(tool: AgentToolDefinition): AgentOpenAiTool {
  return {
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: toolJsonSchema(tool.input) },
  };
}

/** The `load_tools` meta-tool (handled by the run loop, not a registry tool). */
export function loadToolsOpenAiTool(groups: readonly AgentLoadableToolGroup[]): AgentOpenAiTool {
  return {
    type: 'function',
    function: {
      name: LOAD_TOOLS_NAME,
      description: [
        'Load more tools. Only the core tools (games, clubs, players, memory) are listed at first; call this with every group you need before using its tools. Loaded groups stay available for the rest of the chat. Groups:',
        ...groups.map((group) => `- ${group}: ${AGENT_TOOL_GROUP_DESCRIPTIONS[group]}`),
      ].join('\n'),
      parameters: {
        type: 'object',
        properties: {
          groups: { type: 'array', items: { type: 'string', enum: [...groups] }, minItems: 1 },
        },
        required: ['groups'],
        additionalProperties: false,
      },
    },
  };
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

  /**
   * Tools the principal may see. Admin-scope tools are hidden from non-admins; memory
   * tools are hidden unless `agentMemoryEnabled` is true; switched-off tools from everyone.
   */
  toolsForPrincipal(principal: AgentToolAudience): AgentToolDefinition[] {
    return this.list().filter((tool) => visibleTo(tool, principal));
  }

  /** Non-core groups with at least one tool the principal may see, in `AGENT_TOOL_GROUPS` order. */
  groupsForPrincipal(principal: AgentToolAudience): AgentLoadableToolGroup[] {
    const visible = new Set(this.toolsForPrincipal(principal).map(agentToolGroupOf));
    return AGENT_TOOL_GROUPS.filter((group): group is AgentLoadableToolGroup => group !== 'core' && visible.has(group));
  }

  /**
   * `tools[]` for the model. Without `groups`: every tool the principal may see, registry
   * order. With `groups` (tool groups on): core tools, then `load_tools` (when any other group
   * is available), then each requested group's tools in the order given — so loading a group
   * only appends and the earlier prefix stays byte-stable. Permission filtering comes first:
   * a group the principal cannot see contributes nothing.
   */
  openAiToolsFor(principal: AgentToolAudience, options: { groups?: readonly AgentToolGroup[] } = {}): AgentOpenAiTool[] {
    const visible = this.toolsForPrincipal(principal);
    if (!options.groups) return visible.map(toOpenAiTool);
    const out = visible.filter((tool) => agentToolGroupOf(tool) === 'core').map(toOpenAiTool);
    const loadable = this.groupsForPrincipal(principal);
    if (loadable.length) out.push(loadToolsOpenAiTool(loadable));
    const done = new Set<AgentToolGroup>(['core']);
    for (const group of options.groups) {
      if (done.has(group)) continue;
      done.add(group);
      out.push(...visible.filter((tool) => agentToolGroupOf(tool) === group).map(toOpenAiTool));
    }
    return out;
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
    if (!tool || !visibleTo(tool, ctx.principal)) {
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
      const result = await this.runHandler(tool, ctx, parsed.data);
      if (result === TOOL_TIMED_OUT) {
        const seconds = Math.round(this.timeoutFor(tool, ctx) / 1000);
        return {
          ok: false,
          data: {
            error: 'tool_timeout',
            message: `The tool did not answer within ${seconds}s. Nothing was proposed or changed. Try once more with a narrower request, or tell the user it is not available right now.`,
          },
          summary: agentT(locale, 'error.timeout'),
          label,
        };
      }
      return {
        ok: !result.failed,
        data: result.data,
        summary: result.summary,
        label,
        ...(result.entities?.length ? { entities: result.entities } : {}),
        ...(result.web ? { web: result.web } : {}),
        ...(result.images?.length ? { images: result.images } : {}),
        ...(result.card ? { card: result.card } : {}),
        ...(result.awaitingConfirmation ? { awaitingConfirmation: result.awaitingConfirmation } : {}),
        ...(result.memorySaved ? { memorySaved: result.memorySaved } : {}),
      };
    } catch (error) {
      if (error instanceof ApiError) {
        const data: Record<string, unknown> = apiErrorToToolData(error);
        // A not_found on an id of the wrong kind (a game id as clubId): tell the model what it passed.
        if (data.error === 'not_found') {
          const hints = await agentWrongKindIdHints(ctx.principal, parsed.data);
          if (hints.length) data.hint = hints.join(' ');
        }
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

  private timeoutFor(tool: AgentToolDefinition, ctx: AgentToolContext): number {
    return tool.timeoutMs ?? ctx.toolTimeoutMs ?? AGENT_TOOL_DEFAULT_TIMEOUT_MS;
  }

  /** The handler under its deadline (see the header); memory tools run unbounded here. */
  private async runHandler(
    tool: AgentToolDefinition,
    ctx: AgentToolContext,
    args: unknown,
  ): Promise<AgentToolResult | typeof TOOL_TIMED_OUT> {
    if (tool.kind === 'memory') return tool.handler({ ...ctx, tool }, args);
    const ms = this.timeoutFor(tool, ctx);
    const deadline = AbortSignal.timeout(ms);
    const signal = ctx.signal ? AbortSignal.any([ctx.signal, deadline]) : deadline;
    const running = tool.handler({ ...ctx, tool, signal }, args);
    const expired = new Promise<typeof TOOL_TIMED_OUT>((resolve) => {
      if (deadline.aborted) resolve(TOOL_TIMED_OUT);
      deadline.addEventListener('abort', () => resolve(TOOL_TIMED_OUT), { once: true });
    });
    const winner = await Promise.race([running, expired]);
    if (winner !== TOOL_TIMED_OUT) return winner;
    console.warn('[agent] tool timed out', { tool: tool.name, ms, runId: ctx.runId });
    running.then(
      (late) => {
        const actionId = late.awaitingConfirmation?.actionId;
        if (!actionId || !ctx.discardLateProposal) return;
        ctx.discardLateProposal(actionId).catch((error) => console.error('[agent] late proposal not closed', { actionId, error }));
      },
      () => {},
    );
    return TOOL_TIMED_OUT;
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
