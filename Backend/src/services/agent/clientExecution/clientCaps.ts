/**
 * Client capabilities (booking plan §14.5 step 8). The app sends
 * `X-Agent-Client-Caps: booking-v1` on `POST /agent/chats/:id/messages`; the caps are
 * stored on the run (`AgentRun.clientCaps`) and reach tools as `ctx.clientCaps`.
 * Telegram and old app builds send nothing: tools fall back to handoff deep links.
 */
import type { AgentClientCap } from '@bandeja/shared/agentContract';
import type { AgentToolContext } from '../tools/registry';

export { AGENT_CLIENT_CAPS_HEADER } from '@bandeja/shared/agentContract';

export const AGENT_KNOWN_CLIENT_CAPS: readonly AgentClientCap[] = ['booking-v1'];

/** Comma/space separated header → known caps only (unknown tokens dropped, deduped). */
export function parseAgentClientCaps(header: string | null | undefined): AgentClientCap[] {
  if (!header) return [];
  const found = new Set<AgentClientCap>();
  for (const token of header.slice(0, 256).split(/[\s,]+/)) {
    const cap = token.trim().toLowerCase();
    if ((AGENT_KNOWN_CLIENT_CAPS as readonly string[]).includes(cap)) found.add(cap as AgentClientCap);
  }
  return [...found];
}

/** Whether this run's client can execute provider writes itself (claim → adapter → report). */
export function supportsClientExecution(ctx: Pick<AgentToolContext, 'clientCaps'>): boolean {
  return Boolean(ctx.clientCaps?.includes('booking-v1'));
}
