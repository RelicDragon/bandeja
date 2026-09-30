/**
 * User-controlled agent tool permissions (plan §15, docs/domains/agent.md "Permissions").
 *
 * One `AgentToolPermission (userId, toolName, mode)` row per user and write tool; no row
 * = ASK. Only write tools the principal can use (`toolsForPrincipal`) are listed or
 * settable; a `critical` tool can never be ALWAYS_ALLOW (400 `PERMISSION_NOT_ALLOWED`).
 * ALWAYS_ALLOW only skips the tap: the auto-approve path (`agentActionAutoApprove.ts`)
 * still re-authorizes against a freshly loaded principal before executing, and a call
 * escalated to critical (`escalate`) still asks.
 */
import { AgentToolPermissionMode } from '@prisma/client';
import type {
  AgentToolPermissionDto,
  AgentToolPermissionMode as AgentToolPermissionModeContract,
} from '@bandeja/shared/agentContract';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import type { AgentPrincipal } from './access/agentPrincipal';
import { agentToolPermissionText } from './i18n/agentToolPermissionI18n';
import { getAgentToolRegistry } from './tools';
import type { AgentToolDefinition, AgentToolRegistry } from './tools/registry';

type Principal = Pick<AgentPrincipal, 'userId' | 'isAdmin'>;

export const AGENT_TOOL_PERMISSION_MODES: readonly AgentToolPermissionModeContract[] = ['ASK', 'ALWAYS_ALLOW'];

export function isAgentToolPermissionMode(value: unknown): value is AgentToolPermissionModeContract {
  return typeof value === 'string' && (AGENT_TOOL_PERMISSION_MODES as readonly string[]).includes(value);
}

function permissionNotAllowed(toolName: string): ApiError {
  return new ApiError(400, `"${toolName}" is a critical tool and always asks for confirmation`, true, {
    code: 'PERMISSION_NOT_ALLOWED',
  });
}

/** Write tools this principal can use (admin-scope tools only for admins). */
function writeToolsFor(registry: AgentToolRegistry, principal: Principal): AgentToolDefinition[] {
  return registry.toolsForPrincipal(principal).filter((tool) => tool.kind === 'write');
}

function availableWriteTool(registry: AgentToolRegistry, principal: Principal, toolName: string): AgentToolDefinition {
  const tool = writeToolsFor(registry, principal).find((candidate) => candidate.name === toolName);
  if (!tool) throw new ApiError(404, 'Tool not found');
  return tool;
}

function toDto(tool: AgentToolDefinition, mode: AgentToolPermissionMode, locale: string | null | undefined): AgentToolPermissionDto {
  const riskTier = tool.riskTier === 'standard' ? 'standard' : 'critical';
  const text = agentToolPermissionText(locale, tool.name);
  return {
    toolName: tool.name,
    name: text.name,
    description: text.description,
    riskTier,
    // A critical row can only exist from before a re-tiering; it reads (and acts) as ASK.
    mode: riskTier === 'critical' ? 'ASK' : mode,
    canAlwaysAllow: riskTier === 'standard',
  };
}

/**
 * Stored mode for one tool; ASK when there is no row, the tool is unknown or not
 * standard-tier (fail closed).
 */
export async function getAgentToolPermissionMode(
  userId: string,
  toolName: string,
  registry: AgentToolRegistry = getAgentToolRegistry(),
): Promise<AgentToolPermissionModeContract> {
  if (registry.get(toolName)?.riskTier !== 'standard') return 'ASK';
  const row = await prisma.agentToolPermission.findUnique({
    where: { userId_toolName: { userId, toolName } },
    select: { mode: true },
  });
  return row?.mode === AgentToolPermissionMode.ALWAYS_ALLOW ? 'ALWAYS_ALLOW' : 'ASK';
}

export class AgentToolPermissionService {
  constructor(private readonly registry: () => AgentToolRegistry = getAgentToolRegistry) {}

  async list(principal: Principal, locale?: string | null): Promise<AgentToolPermissionDto[]> {
    const tools = writeToolsFor(this.registry(), principal);
    const rows = await prisma.agentToolPermission.findMany({
      where: { userId: principal.userId, toolName: { in: tools.map((tool) => tool.name) } },
      select: { toolName: true, mode: true },
    });
    const modes = new Map(rows.map((row) => [row.toolName, row.mode]));
    return tools.map((tool) => toDto(tool, modes.get(tool.name) ?? AgentToolPermissionMode.ASK, locale));
  }

  async set(
    principal: Principal,
    toolName: string,
    mode: AgentToolPermissionModeContract,
    locale?: string | null,
  ): Promise<AgentToolPermissionDto> {
    if (!isAgentToolPermissionMode(mode)) throw new ApiError(400, 'mode must be ASK or ALWAYS_ALLOW');
    const tool = availableWriteTool(this.registry(), principal, toolName);
    if (mode === 'ALWAYS_ALLOW' && tool.riskTier !== 'standard') throw permissionNotAllowed(toolName);
    if (mode === 'ASK') {
      await prisma.agentToolPermission.deleteMany({ where: { userId: principal.userId, toolName } });
      return toDto(tool, AgentToolPermissionMode.ASK, locale);
    }
    await prisma.agentToolPermission.upsert({
      where: { userId_toolName: { userId: principal.userId, toolName } },
      create: { userId: principal.userId, toolName, mode: AgentToolPermissionMode.ALWAYS_ALLOW },
      update: { mode: AgentToolPermissionMode.ALWAYS_ALLOW },
    });
    return toDto(tool, AgentToolPermissionMode.ALWAYS_ALLOW, locale);
  }

  /** Back to ASK: one tool (404 when unknown / unavailable) or all of the user's rows. */
  async reset(principal: Principal, toolName?: string, locale?: string | null): Promise<AgentToolPermissionDto[]> {
    if (toolName !== undefined) {
      return [await this.set(principal, toolName, 'ASK', locale)];
    }
    await prisma.agentToolPermission.deleteMany({ where: { userId: principal.userId } });
    return this.list(principal, locale);
  }

  /** For confirm `{remember:'always'}`: 400 `PERMISSION_NOT_ALLOWED` unless it could be stored. */
  assertCanAlwaysAllow(principal: Principal, toolName: string): void {
    const tool = availableWriteTool(this.registry(), principal, toolName);
    if (tool.riskTier !== 'standard') throw permissionNotAllowed(toolName);
  }

  static notAllowed(toolName: string): ApiError {
    return permissionNotAllowed(toolName);
  }
}

let defaultService: AgentToolPermissionService | null = null;

export function getAgentToolPermissionService(): AgentToolPermissionService {
  if (!defaultService) defaultService = new AgentToolPermissionService();
  return defaultService;
}
