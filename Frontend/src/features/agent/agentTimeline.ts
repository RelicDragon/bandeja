import type {
  AgentEntityRef,
  AgentMessageDto,
  AgentPendingActionDto,
} from '@shared/agentContract';
import type { AgentRunLiveState } from './agentRunReducer';
import { isTerminalPhase } from './agentRunReducer';

export interface AgentToolItemData {
  callId: string;
  label: string;
  status: 'running' | 'ok' | 'error';
  summary: string | null;
  entities: AgentEntityRef[];
}

export type AgentTimelineItem =
  | { kind: 'user'; key: string; text: string }
  | { kind: 'assistantText'; key: string; text: string; streaming: boolean }
  | { kind: 'tool'; key: string; tool: AgentToolItemData }
  | { kind: 'action'; key: string; actionId: string; action: AgentPendingActionDto | null };

function textOf(message: AgentMessageDto): string {
  return message.blocks
    .map((b) => (b.type === 'text' ? b.text : ''))
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Merge persisted messages with the live run into one render list. Persisted content wins;
 * live content is appended only for what is not saved yet. Tool calls and their results are
 * joined by `callId` across messages (the result may arrive in a later TOOL message or live).
 */
export function buildAgentTimeline(
  messages: readonly AgentMessageDto[],
  actions: readonly AgentPendingActionDto[],
  live: AgentRunLiveState | null,
): AgentTimelineItem[] {
  const actionById = new Map<string, AgentPendingActionDto>();
  for (const a of actions) actionById.set(a.id, a);
  if (live) {
    for (const a of Object.values(live.actions)) {
      if (!actionById.has(a.id)) actionById.set(a.id, a);
    }
  }

  const persistedResults = new Map<string, { ok: boolean; summary: string; entities: AgentEntityRef[] }>();
  const persistedCalls = new Set<string>();
  for (const m of messages) {
    for (const b of m.blocks) {
      if (b.type === 'tool_result') {
        persistedResults.set(b.callId, { ok: b.ok, summary: b.summary, entities: b.entities ?? [] });
      } else if (b.type === 'tool_call') {
        persistedCalls.add(b.callId);
      }
    }
  }

  const liveRunning = live != null && !isTerminalPhase(live.phase);
  const items: AgentTimelineItem[] = [];
  const renderedCalls = new Set<string>();
  const renderedActions = new Set<string>();

  const toolFor = (callId: string, fallbackLabel: string): AgentToolItemData => {
    const result = persistedResults.get(callId);
    if (result) {
      return {
        callId,
        label: fallbackLabel,
        status: result.ok ? 'ok' : 'error',
        summary: result.summary,
        entities: result.entities,
      };
    }
    const step = live?.tools[callId];
    if (step) {
      return {
        callId,
        label: step.label || fallbackLabel,
        // A persisted call without a result in a finished run: the step never completed.
        status: step.status === 'running' && !liveRunning ? 'error' : step.status,
        summary: step.summary,
        entities: step.entities,
      };
    }
    return { callId, label: fallbackLabel, status: liveRunning ? 'running' : 'error', summary: null, entities: [] };
  };

  for (const m of messages) {
    if (m.role === 'USER') {
      const text = textOf(m);
      if (text) items.push({ kind: 'user', key: `m-${m.id}`, text });
      continue;
    }
    m.blocks.forEach((b, i) => {
      const key = `m-${m.id}-${i}`;
      if (b.type === 'text') {
        if (b.text.trim()) items.push({ kind: 'assistantText', key, text: b.text, streaming: false });
      } else if (b.type === 'tool_call') {
        if (renderedCalls.has(b.callId)) return;
        renderedCalls.add(b.callId);
        items.push({ kind: 'tool', key, tool: toolFor(b.callId, b.label) });
      } else if (b.type === 'tool_result') {
        if (persistedCalls.has(b.callId) || renderedCalls.has(b.callId)) return;
        renderedCalls.add(b.callId);
        items.push({
          kind: 'tool',
          key,
          tool: {
            callId: b.callId,
            label: b.summary,
            status: b.ok ? 'ok' : 'error',
            summary: b.summary,
            entities: b.entities ?? [],
          },
        });
      } else if (b.type === 'action') {
        if (renderedActions.has(b.actionId)) return;
        renderedActions.add(b.actionId);
        items.push({ kind: 'action', key, actionId: b.actionId, action: actionById.get(b.actionId) ?? null });
      }
    });
  }

  if (live) {
    live.segments.forEach((s, i) => {
      const key = `live-${live.runId}-${i}`;
      if (s.kind === 'text') {
        if (s.text) {
          const isLast = i === live.segments.length - 1;
          items.push({ kind: 'assistantText', key, text: s.text, streaming: liveRunning && isLast });
        }
      } else if (s.kind === 'tool') {
        if (renderedCalls.has(s.callId)) return;
        renderedCalls.add(s.callId);
        const step = live.tools[s.callId];
        items.push({ kind: 'tool', key, tool: toolFor(s.callId, step?.label ?? '') });
      } else if (s.kind === 'action') {
        if (renderedActions.has(s.actionId)) return;
        renderedActions.add(s.actionId);
        items.push({ kind: 'action', key, actionId: s.actionId, action: actionById.get(s.actionId) ?? null });
      }
    });
  }

  return items;
}
