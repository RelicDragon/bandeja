/**
 * Execute half of an agent write, shared by the confirm tap (`agentActions.service.ts`)
 * and the auto-approve path (`agentActionAutoApprove.ts`): principal re-loaded from the
 * DB → admin-scope check → the tool's `confirm.authorize` (propose-time guard) →
 * `confirm.execute` (same service as the HTTP route). Never throws; failures become a
 * FAILED closing with a safe card line.
 *
 * No dependency on the run service (the run loop imports the auto-approve path).
 */
import type { AgentPendingAction } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { loadAgentPrincipal } from './access/agentPrincipal';
import type { AgentActionClosing, AgentStoredActionArgs } from './agentActionOutcome';
import { agentT } from './i18n/agentI18n';
import type { AgentToolRegistry, AgentWriteOutcome } from './tools/registry';

const KEY_LIKE = /^[a-z][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+)+$/;

/** Safe card line + model note for a failed execution. Never leaks internals. */
export function describeAgentActionFailure(error: unknown, locale: string): { message: string; modelError: string } {
  if (error instanceof ApiError) {
    if (error.statusCode === 404) return { message: agentT(locale, 'result.failedNotFound'), modelError: 'not_found' };
    if (error.statusCode === 401 || error.statusCode === 403) {
      return { message: agentT(locale, 'result.failedForbidden'), modelError: 'forbidden' };
    }
    if (error.statusCode < 500) {
      const detail = error.message.trim();
      if (detail && !KEY_LIKE.test(detail) && detail.length <= 160) {
        return { message: agentT(locale, 'result.failedDetail', { detail }), modelError: detail };
      }
      return { message: agentT(locale, 'result.failed'), modelError: detail || 'rejected' };
    }
  }
  return { message: agentT(locale, 'result.failed'), modelError: 'internal_error' };
}

function modelNotePrefix(auto: boolean): string {
  return auto ? 'Tried to apply automatically (the user always allows this tool)' : 'The user confirmed';
}

/**
 * Model note for a FAILED closing. `changed: false` → "Nothing was changed"; otherwise the
 * outcome's own card line (server-built) says what stayed changed.
 */
export function agentFailureModelNote(
  auto: boolean,
  reason: string,
  outcome: { changed: boolean; message?: string | null },
): string {
  const shown = outcome.message ? ` The user sees: "${outcome.message}".` : '';
  if (!outcome.changed) return `${modelNotePrefix(auto)}, but the change failed (${reason}).${shown} Nothing was changed by this action.`;
  return `${modelNotePrefix(auto)}, but the change failed part-way (${reason}).${shown} Part of it DID change: tell the user exactly what, and do not retry without asking.`;
}

/**
 * Closing for an outcome the tool's `confirm.execute` returned: done, partly done
 * (`partial`, still EXECUTED), or a failure the handler handled itself (`failed`).
 * `partial` reaches the card (`result.partial`) and the model (`modelData.partial`).
 */
export function closingFromAgentWriteOutcome(outcome: AgentWriteOutcome, now: Date, auto: boolean): AgentActionClosing {
  const partial = outcome.partial === true;
  const result = {
    ok: !outcome.failed,
    message: outcome.message,
    ...(outcome.entities?.length ? { entities: outcome.entities } : {}),
    ...(partial ? { partial: true } : {}),
  };
  const modelData = partial ? { ...(outcome.modelData ?? {}), partial: true } : outcome.modelData;
  if (outcome.failed) {
    return {
      status: 'FAILED',
      result,
      modelStatus: 'failed',
      modelNote: agentFailureModelNote(auto, 'handled_by_tool', { changed: outcome.failed.changed, message: outcome.message }),
      modelData,
    };
  }
  let modelNote: string;
  if (partial) {
    modelNote = `${modelNotePrefix(auto)} and the change was only PARTLY applied. The user sees: "${outcome.message}". Tell the user what was and was not done.`;
  } else if (auto) {
    modelNote =
      'Applied automatically: the user always allows this tool, so no confirmation card was needed. The change is done; tell the user.';
  } else {
    modelNote = 'The user confirmed and the change was applied.';
  }
  return { status: 'EXECUTED', result, modelStatus: 'executed', modelNote, modelData, executedAt: now };
}

/**
 * Runs a CONFIRMED action. `autoApproved`: no tap happened (the user always allows this
 * standard-tier tool); only the model notes differ.
 */
export async function executeAgentAction(
  registry: AgentToolRegistry,
  action: AgentPendingAction,
  stored: AgentStoredActionArgs,
  locale: string,
  now: Date,
  options: { autoApproved?: boolean } = {},
): Promise<AgentActionClosing> {
  const auto = options.autoApproved === true;
  try {
    const tool = registry.get(action.toolName);
    if (!tool?.confirm || tool.kind !== 'write') {
      throw new Error(`no confirm executor for ${action.toolName}`);
    }
    // Fresh principal: roles, admin flag and account state as of now, not as of the proposal.
    const principal = await loadAgentPrincipal(action.userId);
    if (tool.scope === 'admin' && !principal.isAdmin) throw new ApiError(403, 'Admin only');
    await tool.confirm.authorize(principal, stored.plan);
    const outcome = await tool.confirm.execute({ principal, locale, timezone: stored.timezone, now }, stored.plan);
    return closingFromAgentWriteOutcome(outcome, now, auto);
  } catch (error) {
    if (!(error instanceof ApiError)) {
      console.error('[agent] confirmed action failed', { actionId: action.id, tool: action.toolName, error });
    }
    const failure = describeAgentActionFailure(error, locale);
    return {
      status: 'FAILED',
      result: { ok: false, message: failure.message },
      modelStatus: 'failed',
      // A throwing handler changed nothing (write tools throw before any side effect;
      // partial side effects must be returned as `outcome.failed` / `partial` instead).
      modelNote: agentFailureModelNote(auto, failure.modelError, { changed: false }),
      error: (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 2000),
    };
  }
}
