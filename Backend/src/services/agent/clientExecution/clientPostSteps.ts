/**
 * Server-side post-steps of client-executed actions (booking plan §14.5 step 5): after the
 * app reports what the provider did, the tool does the game side itself (create / link /
 * unlink / delete). One handler per tool name; slice 7g registers them next to the tools.
 *
 * Called once per report (guarded by `AgentPendingAction.reportedAt`), only when at least
 * one provider call succeeded, with a freshly loaded principal. The provider side already
 * happened: handle your own errors and return `partial` / `failed: { changed: true }`
 * with a message that says what stayed changed. A throw becomes EXECUTED `partial`
 * ("Done at the club, but the follow-up step failed").
 */
import type { AgentClientPlan, AgentClientReportResult } from '@bandeja/shared/agentContract';
import type { AgentWriteContext, AgentWriteOutcome } from '../tools/registry';

export type AgentClientPostStepInput = {
  actionId: string;
  clientPlan: AgentClientPlan;
  /** The tool's server-only payload (`plan.post`). */
  post: unknown;
  /** Validated against the plan; `ok` entries are what the provider actually did. */
  results: AgentClientReportResult[];
  succeeded: AgentClientReportResult[];
  planned: number;
};

export type AgentClientPostStep = (ctx: AgentWriteContext, input: AgentClientPostStepInput) => Promise<AgentWriteOutcome>;

const postSteps = new Map<string, AgentClientPostStep>();

export function registerAgentClientPostStep(toolName: string, handler: AgentClientPostStep): void {
  postSteps.set(toolName, handler);
}

/** Tests only. */
export function unregisterAgentClientPostStep(toolName: string): void {
  postSteps.delete(toolName);
}

export function getAgentClientPostStep(toolName: string): AgentClientPostStep | null {
  return postSteps.get(toolName) ?? null;
}
