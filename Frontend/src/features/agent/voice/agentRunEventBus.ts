import type { AgentStreamEvent } from '@shared/agentContract';

/**
 * Raw run events as the chat's SSE attachment receives them (`useAgentStream`), for listeners
 * that need the stream itself rather than the reduced run state — the voice session speaks
 * `text.delta` as it arrives. Replays after a reconnect are delivered again; listeners dedupe
 * by event id. A short per-run backlog lets a listener that starts following a run late (a
 * confirm follow-up) catch up.
 */
export type AgentRunEventListener = (runId: string, eventId: string | null, event: AgentStreamEvent) => void;

interface BacklogEntry {
  eventId: string | null;
  event: AgentStreamEvent;
}

const MAX_RUNS = 4;
const MAX_EVENTS_PER_RUN = 4000;

const listeners = new Set<AgentRunEventListener>();
const backlog = new Map<string, BacklogEntry[]>();

export function publishAgentRunEvent(runId: string, eventId: string | null, event: AgentStreamEvent): void {
  let entries = backlog.get(runId);
  if (!entries) {
    if (backlog.size >= MAX_RUNS) {
      const oldest = backlog.keys().next().value;
      if (oldest !== undefined) backlog.delete(oldest);
    }
    entries = [];
    backlog.set(runId, entries);
  }
  if (entries.length < MAX_EVENTS_PER_RUN) entries.push({ eventId, event });
  for (const listener of listeners) listener(runId, eventId, event);
}

export function subscribeAgentRunEvents(listener: AgentRunEventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function agentRunEventBacklog(runId: string): readonly BacklogEntry[] {
  return backlog.get(runId) ?? [];
}

/** Tests. */
export function resetAgentRunEventBus(): void {
  listeners.clear();
  backlog.clear();
}
